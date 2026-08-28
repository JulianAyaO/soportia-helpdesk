package com.soportia.ticket;

import com.soportia.common.EventRecorder;
import com.soportia.config.SecurityConfig.UserPrincipal;
import com.soportia.notification.Notifier;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

import static com.soportia.ticket.TicketRules.*;

@RestController
@RequestMapping("/api/v1/tickets")
public class TicketController {
    private final JdbcClient db; private final EventRecorder events; private final Notifier notifier;
    public TicketController(JdbcClient db,EventRecorder events,Notifier notifier){
        this.db=db;this.events=events;this.notifier=notifier;
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    @PreAuthorize("hasRole('EMPLOYEE')")
    public Map<String,Object> create(@Valid @RequestBody CreateTicket r,@AuthenticationPrincipal UserPrincipal p){
        UUID id=UUID.randomUUID(); Priority priority=TicketRules.priority(r.impact(),r.urgency());
        Map<String,Object> category=db.sql("select id,default_team_id from categories where id=:id and active=true")
                .param("id",r.categoryId()).query().listOfRows().stream().findFirst().orElseThrow(()->notFound("Category"));
        Map<String,Object> sla=db.sql("select id,response_minutes,resolution_minutes from sla_policies where priority=:p and active=true")
                .param("p",priority.name()).query().listOfRows().stream().findFirst().orElseThrow(()->notFound("SLA policy"));
        db.sql("update app_sequences set seq_value=seq_value+1 where name='ticket'").update();
        Long sequence=db.sql("select seq_value from app_sequences where name='ticket'").query(Long.class).single();
        String number="SUP-"+sequence; OffsetDateTime now=OffsetDateTime.now();
        db.sql("""
                insert into tickets(id,number,title,description,status,impact,urgency,priority,requester_id,
                team_id,category_id,sla_policy_id,response_due_at,resolution_due_at)
                values(:id,:num,:title,:description,'OPEN',:impact,:urgency,:priority,:requester,
                :team,:category,:sla,:response,:resolution)
                """).param("id",id).param("num",number)
                .param("title",r.title()).param("description",r.description()).param("impact",r.impact())
                .param("urgency",r.urgency()).param("priority",priority.name()).param("requester",p.id())
                .param("team",category.get("default_team_id")).param("category",r.categoryId()).param("sla",sla.get("id"))
                .param("response",BusinessHours.addMinutes(now,((Number)sla.get("response_minutes")).longValue()))
                .param("resolution",BusinessHours.addMinutes(now,((Number)sla.get("resolution_minutes")).longValue())).update();
        events.history(id,p.id(),"CREATED",null,"OPEN");
        Map<String,Object> createdEvent=new LinkedHashMap<>();
        createdEvent.put("ticketId",id);
        createdEvent.put("number",number);
        createdEvent.put("title",r.title());
        createdEvent.put("description",r.description().length()>2000?r.description().substring(0,2000):r.description());
        createdEvent.put("priority",priority.name());
        createdEvent.put("categoryId",r.categoryId());
        if(category.get("default_team_id")!=null)createdEvent.put("suggestedTeamId",category.get("default_team_id"));
        events.outbox("ticket.created",id,createdEvent);
        events.audit(p.id(),"TICKET_CREATED","TICKET",id,Map.of("number",number));
        Object teamId=category.get("default_team_id");
        if(teamId!=null){
            notifier.sendToTeam(asUuid(teamId),id,"TICKET_CREATED","Nuevo ticket en tu cola: "+number,r.title(),p.id());
        }
        return detail(id,p);
    }

    @GetMapping
    public Map<String,Object> list(@RequestParam(defaultValue="0") @Min(0) int page,
                                   @RequestParam(defaultValue="20") @Min(1) @Max(100) int size,
                                   @RequestParam(required=false) String status,
                                   @RequestParam(required=false) String priority,
                                   @RequestParam(required=false) String query,
                                   @RequestParam(required=false) String sort,
                                   @RequestParam(required=false) String dir,
                                   @RequestParam(required=false) UUID forUser,
                                   @RequestParam(required=false) Boolean unassigned,
                                   @RequestParam(required=false) String sla,
                                   @RequestParam(required=false) UUID assignee,
                                   @RequestParam(required=false) Boolean active,
                                   @AuthenticationPrincipal UserPrincipal p){
        UUID scopeUser=null;
        String accessFilter="";
        if(p.role().equals("EMPLOYEE")){
            accessFilter=" and t.requester_id=:uid";
            scopeUser=p.id();
        } else if(p.role().equals("SUPPORT_AGENT")){
            accessFilter=" and (t.assignee_id=:uid or (t.assignee_id is null and exists (select 1 from team_members m where m.team_id=t.team_id and m.user_id=:uid)))";
            scopeUser=p.id();
        } else if(forUser!=null){
            String targetRole=db.sql("select role from users where id=:id and active=true").param("id",forUser)
                    .query(String.class).list().stream().findFirst().orElse("");
            if("SUPPORT_AGENT".equals(targetRole)){
                accessFilter=" and (t.assignee_id=:uid or exists (select 1 from team_members m where m.team_id=t.team_id and m.user_id=:uid))";
                scopeUser=forUser;
            } else if("EMPLOYEE".equals(targetRole)){
                accessFilter=" and t.requester_id=:uid";
                scopeUser=forUser;
            }
        }
        String filter=accessFilter;
        if(status!=null&&!status.isBlank()){ Status.valueOf(status); filter+=" and t.status=:status"; }
        if(priority!=null&&!priority.isBlank()){ Priority.valueOf(priority); filter+=" and t.priority=:priority"; }
        if(Boolean.TRUE.equals(unassigned)) filter+=" and t.assignee_id is null and t.status not in ('CLOSED','CANCELLED')";
        if("BREACHED".equalsIgnoreCase(sla)) filter+=" and t.resolution_due_at<CURRENT_TIMESTAMP and t.status not in ('RESOLVED','CLOSED','CANCELLED')";
        if("AT_RISK".equalsIgnoreCase(sla)) filter+=" and t.resolution_due_at>CURRENT_TIMESTAMP and t.resolution_due_at<=CURRENT_TIMESTAMP + INTERVAL '8 hours' and t.status not in ('RESOLVED','CLOSED','CANCELLED')";
        if(assignee!=null) filter+=" and t.assignee_id=:assignee and t.status not in ('RESOLVED','CLOSED','CANCELLED')";
        if(Boolean.TRUE.equals(active)) filter+=" and t.status in ('OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER')";
        if(query!=null&&!query.isBlank()) filter+=" and (lower(t.number) like :q or lower(t.title) like :q or lower(u.display_name) like :q or lower(coalesce(a.display_name,'')) like :q or lower(coalesce(c.name,'')) like :q)";
        String order=orderBy(sort,dir);
        JdbcClient.StatementSpec q=db.sql("""
                select t.id,t.number,t.title,t.status,t.priority,t.created_at as "createdAt",
                t.updated_at as "updatedAt",u.display_name as "requesterName",a.display_name as "assigneeName",
                t.assignee_id as "assigneeId",c.name as "categoryName",
                case when t.resolution_due_at<CURRENT_TIMESTAMP and t.status not in ('RESOLVED','CLOSED','CANCELLED')
                then 'BREACHED' else 'WITHIN_SLA' end as "slaStatus"
                from tickets t join users u on u.id=t.requester_id left join users a on a.id=t.assignee_id
                left join categories c on c.id=t.category_id
                where 1=1
                """+filter+" order by "+order+" limit :limit offset :offset")
                .param("limit",size).param("offset",page*size);
        JdbcClient.StatementSpec count=db.sql("""
                select count(*) from tickets t join users u on u.id=t.requester_id
                left join users a on a.id=t.assignee_id left join categories c on c.id=t.category_id
                where 1=1
                """+filter);
        if(scopeUser!=null){q=q.param("uid",scopeUser);count=count.param("uid",scopeUser);}
        if(status!=null&&!status.isBlank()){q=q.param("status",status);count=count.param("status",status);}
        if(priority!=null&&!priority.isBlank()){q=q.param("priority",priority);count=count.param("priority",priority);}
        if(assignee!=null){q=q.param("assignee",assignee);count=count.param("assignee",assignee);}
        if(query!=null&&!query.isBlank()){
            String like="%"+query.toLowerCase(Locale.ROOT).trim()+"%";
            q=q.param("q",like);count=count.param("q",like);
        }
        long total=count.query(Long.class).single();
        return Map.of("content",q.query().listOfRows(),"page",page,"size",size,"totalElements",total,
                "totalPages",(total+size-1)/size);
    }

    private static String orderBy(String sort,String dir){
        String column=switch(sort==null?"":sort){
            case "number" -> "t.number";
            case "status" -> "case t.status when 'OPEN' then 1 when 'IN_PROGRESS' then 2 when 'WAITING_FOR_REQUESTER' then 3 when 'RESOLVED' then 4 when 'CLOSED' then 5 when 'CANCELLED' then 6 else 9 end";
            case "priority" -> "case t.priority when 'LOW' then 1 when 'MEDIUM' then 2 when 'HIGH' then 3 when 'CRITICAL' then 4 else 9 end";
            case "requester" -> "u.display_name";
            case "assignee" -> "a.display_name";
            case "updated" -> "t.updated_at";
            default -> "t.created_at";
        };
        boolean desc=sort==null||sort.isBlank()||"desc".equalsIgnoreCase(dir);
        return column+(desc?" desc":" asc")+(sort==null||sort.isBlank()||"updated".equals(sort)?"":", t.created_at desc");
    }

    @GetMapping("/{id}")
    public Map<String,Object> detail(@PathVariable UUID id,@AuthenticationPrincipal UserPrincipal p){
        return loadDetail(id,p,true);
    }
    private Map<String,Object> loadDetail(UUID id,UserPrincipal p,boolean checkAccess){
        Map<String,Object> ticket=db.sql("""
                select t.*,r.display_name as requester_name,a.display_name as assignee_name,
                tm.name as team_name,c.name as category_name,s.name as sla_name from tickets t
                join users r on r.id=t.requester_id left join users a on a.id=t.assignee_id
                left join teams tm on tm.id=t.team_id left join categories c on c.id=t.category_id
                left join sla_policies s on s.id=t.sla_policy_id where t.id=:id
                """)
                .param("id",id).query().listOfRows().stream().findFirst().orElseThrow(()->notFound("Ticket"));
        if(checkAccess) authorize(ticket,p);
        String commentsSql="""
                select c.id,c.body,c.visibility,c.created_at as "createdAt",u.id as "authorId",
                u.display_name as "authorName" from comments c join users u on u.id=c.author_id
                where c.ticket_id=:id
                """+(p.role().equals("EMPLOYEE")?" and c.visibility='PUBLIC'":"")+" order by c.created_at";
        Map<String,Object> result=new LinkedHashMap<>(ticket);
        result.put("comments",db.sql(commentsSql).param("id",id).query().listOfRows());
        result.put("history",readableHistory(id));
        result.put("attachments",db.sql("""
                select id,original_name as "fileName",content_type as "contentType",size_bytes as "sizeBytes",
                comment_id as "commentId",created_at as "createdAt"
                from ticket_attachments where ticket_id=:id order by created_at
                """).param("id",id).query().listOfRows());
        result.put("slaStatus",slaStatus(ticket));
        return result;
    }

    @PostMapping("/{id}/comments") @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> comment(@PathVariable UUID id,@Valid @RequestBody CommentRequest r,
                                      @AuthenticationPrincipal UserPrincipal p){
        Map<String,Object> ticket=raw(id); authorize(ticket,p);
        if(p.role().equals("EMPLOYEE")&&r.visibility()==Visibility.INTERNAL) throw new AccessDeniedException("Internal comments require support role");
        if(p.role().equals("EMPLOYEE")&&!hasAgentReply(id,ticket.get("requester_id")))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"El ticket aún no tiene respuesta del equipo de soporte");
        UUID commentId=UUID.randomUUID();
        db.sql("insert into comments(id,ticket_id,author_id,body,visibility) values(:id,:t,:a,:b,:v)")
                .param("id",commentId).param("t",id).param("a",p.id()).param("b",r.body()).param("v",r.visibility().name()).update();
        if(!p.role().equals("EMPLOYEE")&&ticket.get("first_response_at")==null&&r.visibility()==Visibility.PUBLIC)
            db.sql("update tickets set first_response_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP where id=:id").param("id",id).update();
        events.history(id,p.id(),"COMMENTED",null,r.visibility().name());
        events.outbox("ticket.comment.created",id,Map.of("ticketId",id,"commentId",commentId,"visibility",r.visibility().name()));
        events.audit(p.id(),"TICKET_COMMENTED","TICKET",id,Map.of("visibility",r.visibility().name()));
        UUID requester=asUuid(ticket.get("requester_id"));
        if(r.visibility()==Visibility.PUBLIC&&requester!=null&&!requester.equals(p.id())){
            String preview=r.body().length()>160?r.body().substring(0,157)+"...":r.body();
            notifier.send(requester,id,"TICKET_REPLY","Nueva respuesta en "+ticket.get("number"),preview);
        }
        return Map.of("id",commentId,"body",r.body(),"visibility",r.visibility(),"authorId",p.id(),"createdAt",Instant.now());
    }

    @PostMapping("/{id}/take") @PreAuthorize("hasAnyRole('SUPPORT_AGENT','ADMIN')") @Transactional
    public Map<String,Object> take(@PathVariable UUID id,@AuthenticationPrincipal UserPrincipal p){
        return assignInternal(id,p.id(),p);
    }
    @PostMapping("/{id}/assign") @PreAuthorize("hasAnyRole('SUPPORT_AGENT','ADMIN')") @Transactional
    public Map<String,Object> assign(@PathVariable UUID id,@Valid @RequestBody AssignRequest r,@AuthenticationPrincipal UserPrincipal p){
        Map<String,Object> target=db.sql("select id,role from users where id=:id and active=true and role in ('SUPPORT_AGENT','ADMIN')")
                .param("id",r.assigneeId()).query().listOfRows().stream().findFirst().orElseThrow(()->notFound("Agent"));
        String targetRole=String.valueOf(target.get("role"));
        if(p.role().equals("SUPPORT_AGENT")&&!"SUPPORT_AGENT".equals(targetRole))
            throw new AccessDeniedException("Los agentes solo pueden asignar a otros agentes");
        if(p.role().equals("ADMIN")&&"ADMIN".equals(targetRole)&&!p.id().equals(r.assigneeId()))
            throw new AccessDeniedException("El administrador solo puede asignarse el ticket a sí mismo");
        return assignInternal(id,r.assigneeId(),p);
    }
    private Map<String,Object> assignInternal(UUID id,UUID assignee,UserPrincipal actor){
        Map<String,Object> old=raw(id);
        authorize(old,actor);
        UUID destTeam=primaryTeam(assignee);
        UUID destCategory=destTeam==null?null:defaultCategoryOf(destTeam);
        boolean moveTeam=destTeam!=null&&!destTeam.toString().equals(Objects.toString(old.get("team_id"),""));
        String extra="";
        if(destTeam!=null) extra+=",team_id=:team";
        if(moveTeam&&destCategory!=null) extra+=",category_id=:cat";
        var spec=db.sql("""
                update tickets set assignee_id=:a,updated_at=CURRENT_TIMESTAMP,version=version+1
                """+extra+" where id=:id and version=:version")
                .param("a",assignee).param("id",id).param("version",old.get("version"));
        if(destTeam!=null) spec=spec.param("team",destTeam);
        if(moveTeam&&destCategory!=null) spec=spec.param("cat",destCategory);
        if(spec.update()==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Ticket was modified by another request");
        if(moveTeam) events.history(id,actor.id(),"TEAM_CHANGED",Objects.toString(old.get("team_id"),null),destTeam.toString());
        events.history(id,actor.id(),"ASSIGNED",Objects.toString(old.get("assignee_id"),null),assignee.toString());
        events.outbox("ticket.assigned",id,Map.of("ticketId",id,"assigneeId",assignee));
        events.audit(actor.id(),"TICKET_ASSIGNED","TICKET",id,Map.of("assigneeId",assignee));
        if(!assignee.equals(actor.id())){
            String actorName=personName(actor.id().toString());
            String extraNote=moveTeam?" y lo envió a "+teamName(destTeam.toString()):"";
            notifier.send(assignee,id,"TICKET_ASSIGNED","Te enviaron "+old.get("number"),
                    actorName+" te asignó este ticket"+extraNote+".");
        }
        return loadDetail(id,actor,false);
    }

    @PostMapping("/{id}/transition") @Transactional
    public Map<String,Object> transition(@PathVariable UUID id,@Valid @RequestBody TransitionRequest r,
                                         @AuthenticationPrincipal UserPrincipal p){
        Map<String,Object> ticket=raw(id); Status from=Status.valueOf(ticket.get("status").toString());
        if(p.role().equals("EMPLOYEE")){
            authorize(ticket,p);
            boolean allowed=(from==Status.OPEN&&r.status()==Status.CANCELLED)
                    ||(from==Status.RESOLVED&&r.status()==Status.CLOSED);
            if(!allowed) throw new AccessDeniedException("Employees may cancel open tickets or close resolved tickets");
        } else authorize(ticket,p);
        if(!canTransition(from,r.status())) throw new ResponseStatusException(HttpStatus.CONFLICT,"Invalid transition "+from+" -> "+r.status());
        String extra=switch(r.status()){
            case RESOLVED -> ",resolved_at=CURRENT_TIMESTAMP";
            case CLOSED -> ",closed_at=CURRENT_TIMESTAMP";
            case IN_PROGRESS -> from==Status.RESOLVED?",resolved_at=NULL,closed_at=NULL":"";
            default -> "";
        };
        int changed=db.sql("update tickets set status=:s,updated_at=CURRENT_TIMESTAMP,version=version+1"+extra+" where id=:id and version=:version")
                .param("s",r.status().name()).param("id",id).param("version",ticket.get("version")).update();
        if(changed==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Ticket was modified by another request");
        events.history(id,p.id(),"STATUS_CHANGED",from.name(),r.status().name());
        events.outbox("ticket.status.changed",id,Map.of("ticketId",id,"from",from.name(),"to",r.status().name()));
        events.audit(p.id(),"TICKET_TRANSITIONED","TICKET",id,Map.of("from",from,"to",r.status()));
        UUID requester=asUuid(ticket.get("requester_id"));
        if(requester!=null&&!requester.equals(p.id())){
            String label=statusLabel(r.status().name());
            notifier.send(requester,id,"TICKET_STATUS","El estado de "+ticket.get("number")+" cambió a "+label,
                    "Tu ticket ahora está "+label.toLowerCase()+".");
        }
        return detail(id,p);
    }

    void authorizeFor(UUID id,UserPrincipal p){authorize(raw(id),p);}
    void ensureCommentOnTicket(UUID ticketId,UUID commentId){
        Long count=db.sql("select count(*) from comments where id=:cid and ticket_id=:tid")
                .param("cid",commentId).param("tid",ticketId).query(Long.class).single();
        if(count==0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Comment does not belong to ticket");
    }
    private List<Map<String,Object>> readableHistory(UUID ticketId){
        List<Map<String,Object>> rows=db.sql("""
                select event_type as "eventType",old_value as "oldValue",new_value as "newValue",
                created_at as "createdAt" from ticket_history where ticket_id=:id order by created_at
                """).param("id",ticketId).query().listOfRows();
        for(Map<String,Object> row:rows){
            row.put("summary",historySummary(Objects.toString(row.get("eventType"),""),
                    Objects.toString(row.get("oldValue"),null),
                    Objects.toString(row.get("newValue"),null)));
        }
        return rows;
    }
    private String historySummary(String type,String oldValue,String newValue){
        return switch(type){
            case "CREATED" -> "Se creó el ticket.";
            case "STATUS_CHANGED" -> "El estado cambió de "+statusLabel(oldValue)+" a "+statusLabel(newValue)+".";
            case "COMMENTED" -> "INTERNAL".equals(newValue)?"Se añadió una nota interna.":"Se publicó un comentario.";
            case "ASSIGNED" -> "Se asignó a "+personName(newValue)+".";
            case "TEAM_CHANGED" -> "El ticket se envió al equipo "+teamName(newValue)+".";
            case "AUTOMATION_ROUTED" -> "La automatización lo envió al equipo "+teamName(newValue)+".";
            case "AUTOMATION_ASSIGNED" -> "La automatización lo asignó a "+personName(newValue)+".";
            case "AUTOMATION_ESCALATED" -> "La automatización subió la prioridad de "+priorityLabel(oldValue)+" a "+priorityLabel(newValue)+".";
            case "AUTOMATION_COMMENTED" -> "La automatización publicó una respuesta guiada.";
            case "AUTOMATION_REMINDED" -> "La automatización recordó al solicitante que el ticket espera su respuesta.";
            case "RESOLUTION_BREACHED" -> "Se incumplió el plazo de resolución.";
            case "RESOLUTION_AT_RISK" -> "El plazo de resolución está en riesgo.";
            default -> "Se actualizó el ticket.";
        };
    }
    private String statusLabel(String status){
        if(status==null||status.isBlank()||"null".equals(status)) return "sin estado";
        return switch(status){
            case "OPEN" -> "Abierto";
            case "IN_PROGRESS" -> "En progreso";
            case "WAITING_FOR_REQUESTER" -> "En espera del solicitante";
            case "RESOLVED" -> "Resuelto";
            case "CLOSED" -> "Cerrado";
            case "CANCELLED" -> "Cancelado";
            default -> status;
        };
    }
    private String priorityLabel(String priority){
        if(priority==null||priority.isBlank()||"null".equals(priority)) return "sin prioridad";
        return switch(priority){
            case "LOW" -> "Baja";
            case "MEDIUM" -> "Media";
            case "HIGH" -> "Alta";
            case "CRITICAL" -> "Crítica";
            default -> priority;
        };
    }
    private String personName(String id){
        UUID uuid=parseUuid(id);
        if(uuid==null) return "un agente";
        return db.sql("select display_name from users where id=:id").param("id",uuid).query(String.class).list()
                .stream().findFirst().orElse("un agente");
    }
    private String teamName(String id){
        UUID uuid=parseUuid(id);
        if(uuid==null) return "el equipo correspondiente";
        String name=db.sql("select name from teams where id=:id").param("id",uuid).query(String.class).list()
                .stream().findFirst().orElse("el equipo correspondiente");
        return switch(name){
            case "Service Desk" -> "Mesa de servicio";
            case "IT Operations" -> "Operaciones de equipos";
            default -> name;
        };
    }
    private UUID primaryTeam(UUID userId){
        return db.sql("select team_id from team_members where user_id=:id order by team_id limit 1")
                .param("id",userId).query(UUID.class).list().stream().findFirst().orElse(null);
    }
    private UUID defaultCategoryOf(UUID teamId){
        return db.sql("select id from categories where default_team_id=:t and active=true order by name limit 1")
                .param("t",teamId).query(UUID.class).list().stream().findFirst().orElse(null);
    }
    private static UUID asUuid(Object value){
        if(value instanceof UUID uuid) return uuid;
        return parseUuid(Objects.toString(value,null));
    }
    private static UUID parseUuid(String value){
        if(value==null||value.isBlank()||"null".equals(value)) return null;
        try{return UUID.fromString(value.trim());}catch(IllegalArgumentException ex){return null;}
    }
    private boolean hasAgentReply(UUID ticketId,Object requesterId){
        return db.sql("select count(*) from comments where ticket_id=:id and visibility='PUBLIC' and author_id<>:uid")
                .param("id",ticketId).param("uid",requesterId).query(Long.class).single()>0;
    }
    private Map<String,Object> raw(UUID id){return db.sql("select * from tickets where id=:id").param("id",id).query().listOfRows().stream().findFirst().orElseThrow(()->notFound("Ticket"));}
    private void authorize(Map<String,Object> t,UserPrincipal p){
        if(p.role().equals("EMPLOYEE")&&!p.id().toString().equals(t.get("requester_id").toString())) throw new AccessDeniedException("Ticket is not owned by requester");
        if(p.role().equals("SUPPORT_AGENT")){
            boolean assigned=p.id().toString().equals(Objects.toString(t.get("assignee_id"),""));
            boolean team=t.get("team_id")!=null&&db.sql("select count(*) from team_members where team_id=:team and user_id=:user")
                    .param("team",t.get("team_id")).param("user",p.id()).query(Long.class).single()>0;
            if(!assigned&&!team)throw new AccessDeniedException("Ticket is outside the agent's teams");
        }
    }
    private String slaStatus(Map<String,Object> t){
        String status=t.get("status").toString();
        if(List.of("RESOLVED","CLOSED","CANCELLED").contains(status))return "STOPPED";
        Object due=t.get("resolution_due_at");
        return due instanceof java.time.OffsetDateTime d&&d.toInstant().isBefore(Instant.now())?"BREACHED":"WITHIN_SLA";
    }
    private ResponseStatusException notFound(String what){return new ResponseStatusException(HttpStatus.NOT_FOUND,what+" not found");}
    public enum Visibility { PUBLIC, INTERNAL }
    public record CreateTicket(@NotBlank @Size(max=200) String title,@NotBlank @Size(max=10000) String description,
                               @Min(1) @Max(3) int impact,@Min(1) @Max(3) int urgency,@NotNull UUID categoryId){}
    public record CommentRequest(@NotBlank @Size(max=10000) String body,@NotNull Visibility visibility){}
    public record AssignRequest(@NotNull UUID assigneeId){}
    public record TransitionRequest(@NotNull Status status){}
}
