package com.soportia.dashboard;

import com.soportia.config.SecurityConfig.UserPrincipal;
import com.soportia.ticket.BusinessHours;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private static final String QUEUE = "status not in ('RESOLVED','CLOSED','CANCELLED')";
    private static final Set<String> VOLUME_COLUMNS = Set.of("created_at", "resolved_at");
    private final JdbcClient db;
    public DashboardController(JdbcClient db){this.db=db;}
    @GetMapping
    public Map<String,Object> dashboard(@AuthenticationPrincipal UserPrincipal p){
        boolean employee=p.role().equals("EMPLOYEE");
        boolean agent=p.role().equals("SUPPORT_AGENT");
        String filter=employee
                ? " where requester_id=:id"
                : agent
                    ? " where (assignee_id=:id or (assignee_id is null and exists (select 1 from team_members m where m.team_id=tickets.team_id and m.user_id=:id)))"
                    : "";
        JdbcClient.StatementSpec byStatus=db.sql("select status,count(*) as count from tickets"+filter+" group by status");
        JdbcClient.StatementSpec byPriority=db.sql("select priority,count(*) as count from tickets"+filter
                +(filter.isEmpty()?" where ":" and ")+QUEUE+" group by priority");
        JdbcClient.StatementSpec breached=db.sql("""
                select count(*) from tickets
                """+filter+(filter.isEmpty()?" where ":" and ")+
                "resolution_due_at<CURRENT_TIMESTAMP and "+QUEUE);
        if(employee||agent){byStatus=byStatus.param("id",p.id());byPriority=byPriority.param("id",p.id());breached=breached.param("id",p.id());}
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("byStatus",byStatus.query().listOfRows());
        result.put("byPriority",byPriority.query().listOfRows());
        result.put("slaBreached",breached.query(Long.class).single());
        if(!employee){
            String unassigned="select count(*) from tickets where assignee_id is null and "+QUEUE;
            if(agent) unassigned+=" and exists (select 1 from team_members m where m.team_id=tickets.team_id and m.user_id=:id)";
            var spec=db.sql(unassigned);
            if(agent) spec=spec.param("id",p.id());
            result.put("unassigned",spec.query(Long.class).single());
        }
        if(p.role().equals("ADMIN")){
            OffsetDateTime weekStart=startOfDay(6);
            OffsetDateTime prevStart=startOfDay(13);
            OffsetDateTime twoWeekStart=startOfDay(13);
            result.put("byTeam",db.sql("""
                    select coalesce(tm.name,'Sin equipo') as name,count(*) as count
                    from tickets t left join teams tm on tm.id=t.team_id
                    where t.status not in ('RESOLVED','CLOSED','CANCELLED')
                    group by 1 order by 2 desc
                    """).query().listOfRows());
            result.put("byCategory",db.sql("""
                    select coalesce(c.name,'Sin categoría') as name,count(*) as count
                    from tickets t left join categories c on c.id=t.category_id
                    where t.status not in ('RESOLVED','CLOSED','CANCELLED')
                    group by 1 order by 2 desc
                    """).query().listOfRows());
            result.put("usersByRole",db.sql("select role,count(*) as count from users where active=true group by role").query().listOfRows());
            result.put("createdWeek",countSince("created_at", weekStart));
            result.put("resolvedWeek",countSince("resolved_at", weekStart));
            result.put("createdPrevWeek",countBetween("created_at", prevStart, weekStart));
            result.put("resolvedPrevWeek",countBetween("resolved_at", prevStart, weekStart));
            result.put("createdByDay",volumeByDay("created_at"));
            result.put("resolvedByDay",volumeByDay("resolved_at"));
            result.put("slaAtRisk",db.sql("""
                    select count(*) from tickets
                    where status not in ('RESOLVED','CLOSED','CANCELLED')
                      and resolution_due_at>CURRENT_TIMESTAMP
                      and resolution_due_at<=CURRENT_TIMESTAMP + INTERVAL '8 hours'
                    """).query(Long.class).single());
            result.put("avgResolutionHours",db.sql("""
                    select coalesce(avg(extract(epoch from (resolved_at-created_at))/3600.0),0)
                    from tickets where resolved_at is not null and resolved_at>=:start
                      and resolved_at>=created_at
                    """).param("start", twoWeekStart).query(Double.class).single());
            result.put("avgFirstResponseHours",db.sql("""
                    select coalesce(avg(extract(epoch from (first_response_at-created_at))/3600.0),0)
                    from tickets where first_response_at is not null and created_at>=:start
                      and first_response_at>=created_at
                    """).param("start", twoWeekStart).query(Double.class).single());
            result.put("byAgent",db.sql("""
                    select u.id,u.display_name as name,
                    (select count(*) from tickets t where t.assignee_id=u.id
                     and t.status not in ('RESOLVED','CLOSED','CANCELLED')) as "openCount",
                    (select count(*) from tickets t where t.assignee_id=u.id
                     and t.resolved_at>=:start) as "resolvedWeek"
                    from users u where u.role='SUPPORT_AGENT' and u.active=true
                    order by 3 desc,u.display_name
                    """).param("start", weekStart).query().listOfRows());
            result.put("attention",db.sql("""
                    select t.id,t.number,t.title,t.status,t.priority,
                    a.display_name as "assigneeName",c.name as "categoryName",
                    t.resolution_due_at as "dueAt",
                    case when t.resolution_due_at<CURRENT_TIMESTAMP then 'BREACHED'
                         when t.resolution_due_at<=CURRENT_TIMESTAMP + INTERVAL '8 hours' then 'AT_RISK'
                         when t.assignee_id is null then 'UNASSIGNED'
                         else 'WITHIN_SLA' end as "slaStatus"
                    from tickets t
                    left join users a on a.id=t.assignee_id
                    left join categories c on c.id=t.category_id
                    where t.status not in ('RESOLVED','CLOSED','CANCELLED')
                    order by case
                      when t.resolution_due_at<CURRENT_TIMESTAMP then 0
                      when t.resolution_due_at<=CURRENT_TIMESTAMP + INTERVAL '8 hours' then 1
                      when t.assignee_id is null then 2
                      else 3 end,
                    t.resolution_due_at nulls last,t.updated_at
                    limit 8
                    """).query().listOfRows());
        }
        return result;
    }

    private long countSince(String column, OffsetDateTime start){
        return db.sql("select count(*) from tickets where "+safeColumn(column)+">=:start")
                .param("start", start).query(Long.class).single();
    }

    private long countBetween(String column, OffsetDateTime start, OffsetDateTime end){
        return db.sql("select count(*) from tickets where "+safeColumn(column)+">=:start and "+safeColumn(column)+"<:end")
                .param("start", start).param("end", end).query(Long.class).single();
    }

    private List<Map<String,Object>> volumeByDay(String column){
        String col=safeColumn(column);
        LocalDate today=LocalDate.now(BusinessHours.ZONE);
        Map<String,Long> days=new LinkedHashMap<>();
        for(int i=13;i>=0;i--) days.put(today.minusDays(i).toString(),0L);
        OffsetDateTime start=startOfDay(13);
        for(Map<String,Object> row:db.sql("""
                select to_char(%s AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') as day, count(*) as count
                from tickets where %s>=:start
                group by 1
                """.formatted(col, col)).param("start", start).query().listOfRows()){
            String day=String.valueOf(row.get("day"));
            if(days.containsKey(day)) days.put(day, ((Number)row.get("count")).longValue());
        }
        List<Map<String,Object>> series=new ArrayList<>();
        days.forEach((day,count)->{
            Map<String,Object> point=new LinkedHashMap<>();
            point.put("day",day);
            point.put("count",count);
            series.add(point);
        });
        return series;
    }

    private static OffsetDateTime startOfDay(int daysAgo){
        return LocalDate.now(BusinessHours.ZONE).minusDays(daysAgo).atStartOfDay(BusinessHours.ZONE).toOffsetDateTime();
    }

    private static String safeColumn(String column){
        if(!VOLUME_COLUMNS.contains(column)) throw new IllegalArgumentException("Unsupported volume column");
        return column;
    }
}
