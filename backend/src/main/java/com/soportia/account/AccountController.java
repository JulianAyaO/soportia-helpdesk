package com.soportia.account;

import com.soportia.config.SecurityConfig.UserPrincipal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {
    private final JdbcClient db;
    public AccountController(JdbcClient db){this.db=db;}

    @GetMapping
    public Map<String,Object> me(@AuthenticationPrincipal UserPrincipal p){
        Map<String,Object> user=new LinkedHashMap<>(db.sql("""
                select id,email,display_name as "displayName",role,created_at as "createdAt"
                from users where id=:id
                """).param("id",p.id()).query().singleRow());
        List<Map<String,Object>> teams=db.sql("""
                select t.id,t.name,t.description
                from teams t join team_members m on m.team_id=t.id
                where m.user_id=:id order by t.name
                """).param("id",p.id()).query().listOfRows();
        for(Map<String,Object> team:teams){
            team.put("categories",db.sql("select name from categories where default_team_id=:id and active=true order by name")
                    .param("id",team.get("id")).query(String.class).list());
        }
        user.put("teams",teams);
        boolean employee=p.role().equals("EMPLOYEE");
        var countSql=db.sql("""
                select count(*) as total,
                coalesce(sum(case when status not in ('RESOLVED','CLOSED','CANCELLED') then 1 else 0 end),0) as open
                from tickets where 1=1
                """+(employee?" and requester_id=:id":""));
        var counts=(employee?countSql.param("id",p.id()):countSql).query().singleRow();
        user.put("ticketTotal",counts.get("total"));
        user.put("ticketOpen",counts.get("open"));
        return user;
    }
}
