package com.soportia.automation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soportia.common.EventRecorder;
import com.soportia.config.SecurityConfig.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/automations")
@PreAuthorize("hasRole('ADMIN')")
public class AutomationController {
    private final JdbcClient db; private final ObjectMapper json; private final EventRecorder events;
    public AutomationController(JdbcClient db,ObjectMapper json,EventRecorder events){
        this.db=db;this.json=json;this.events=events;
    }

    @GetMapping public List<Map<String,Object>> list(){
        return db.sql("""
                select a.id,a.name,a.event_type as "eventType",a.enabled,
                       a.conditions_json as conditions,a.actions_json as actions,a.created_at as "createdAt",
                       count(e.id) as executions,
                       coalesce(sum(case when e.status='SUCCESS' then 1 else 0 end),0) as "successCount",
                       coalesce(sum(case when e.status<>'SUCCESS' then 1 else 0 end),0) as "errorCount",
                       coalesce(avg(e.duration_ms),0) as "averageDurationMs",
                       max(e.created_at) as "lastExecution"
                from automations a left join automation_executions e on e.automation_id=a.id
                group by a.id,a.name,a.event_type,a.enabled,a.conditions_json,a.actions_json,a.created_at
                order by a.created_at desc
                """).query().listOfRows();
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> create(@Valid @RequestBody AutomationRequest r){
        UUID id=UUID.randomUUID();
        db.sql("""
                insert into automations(id,name,event_type,enabled,conditions_json,actions_json)
                values(:id,:n,:e,:enabled,:c,:a)
                """).param("id",id).param("n",r.name()).param("e",r.eventType())
                .param("enabled",r.enabled()).param("c",r.conditions().toString()).param("a",r.actions().toString()).update();
        return get(id);
    }
    @PutMapping("/{id}")
    public Map<String,Object> update(@PathVariable UUID id,@Valid @RequestBody AutomationRequest r,
                                     @AuthenticationPrincipal UserPrincipal p){
        int changed=db.sql("""
                update automations set name=:n,event_type=:e,enabled=:enabled,conditions_json=:c,actions_json=:a
                where id=:id
                """).param("n",r.name()).param("e",r.eventType()).param("enabled",r.enabled())
                .param("c",r.conditions().toString()).param("a",r.actions().toString()).param("id",id).update();
        if(changed==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Automation not found");
        events.audit(p.id(),"AUTOMATION_UPDATED","AUTOMATION",id,Map.of("name",r.name(),"enabled",r.enabled()));
        return get(id);
    }
    @GetMapping("/{id}/executions")
    public List<Map<String,Object>> executions(@PathVariable UUID id){
        return db.sql("""
                select e.id,e.status,e.result,e.created_at as "createdAt",
                e.completed_at as "completedAt",e.duration_ms as "durationMs",
                t.id as "ticketId",t.number as "ticketNumber",t.title as "ticketTitle"
                from automation_executions e
                left join outbox_events o on o.id=e.event_id
                left join tickets t on t.id=o.aggregate_id
                where e.automation_id=:id order by e.created_at desc
                """)
                .param("id",id).query().listOfRows();
    }
    private Map<String,Object> get(UUID id){return db.sql("select * from automations where id=:id").param("id",id).query().listOfRows().stream().findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Automation not found"));}
    public record AutomationRequest(@NotBlank String name,@NotBlank String eventType,boolean enabled,
                                    @NotNull JsonNode conditions,@NotNull JsonNode actions){}
}
