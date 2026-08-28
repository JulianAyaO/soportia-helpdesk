package com.soportia.support;

import com.soportia.common.EventRecorder;
import com.soportia.config.SecurityConfig.UserPrincipal;
import com.soportia.notification.Notifier;
import com.soportia.realtime.PresenceHub;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff-messages")
public class StaffMessageController {
    private final JdbcClient db;
    private final Notifier notifier;
    private final EventRecorder events;
    private final PresenceHub realtime;
    public StaffMessageController(JdbcClient db,Notifier notifier,EventRecorder events,PresenceHub realtime){
        this.db=db;this.notifier=notifier;this.events=events;this.realtime=realtime;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('EMPLOYEE','SUPPORT_AGENT','ADMIN')")
    public Map<String,Object> list(@RequestParam(required=false) UUID agentId,@AuthenticationPrincipal UserPrincipal p){
        Map<String,Object> result=new LinkedHashMap<>();
        if(p.role().equals("ADMIN")){
            result.put("threads",db.sql("""
                    select u.id,u.display_name as "displayName",u.role,
                    (select max(created_at) from staff_messages s where s.agent_id=u.id) as "lastAt",
                    (select left(coalesce(nullif(body,''),t.number,'Mensaje'),120)
                     from staff_messages s left join tickets t on t.id=s.ticket_id
                     where s.agent_id=u.id order by s.created_at desc limit 1) as preview
                    from users u
                    where exists (select 1 from staff_messages s where s.agent_id=u.id)
                    order by 4 desc nulls last
                    """).query().listOfRows());
            if(agentId==null){
                result.put("messages",List.of());
                return result;
            }
        }
        UUID thread=threadOwner(agentId,p);
        result.put("agentId",thread);
        List<Map<String,Object>> messages=db.sql("""
                select m.id,m.body,m.created_at as "createdAt",u.id as "authorId",
                u.display_name as "authorName",u.role as "authorRole",
                t.id as "ticketId",t.number as "ticketNumber",t.title as "ticketTitle"
                from staff_messages m join users u on u.id=m.author_id
                left join tickets t on t.id=m.ticket_id
                where m.agent_id=:agent order by m.created_at
                """).param("agent",thread).query().listOfRows();
        attachFiles(messages);
        result.put("messages",messages);
        return result;
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    @PreAuthorize("hasAnyRole('SUPPORT_AGENT','ADMIN')")
    public Map<String,Object> post(@Valid @RequestBody MessageRequest r,@AuthenticationPrincipal UserPrincipal p){
        UUID thread=threadOwner(r.agentId(),p);
        String body=r.body()==null?"":r.body().trim();
        if(r.ticketId()!=null) authorizeTicket(r.ticketId(),p);
        UUID id=UUID.randomUUID();
        db.sql("insert into staff_messages(id,agent_id,author_id,body,ticket_id) values(:id,:agent,:author,:body,:ticket)")
                .param("id",id).param("agent",thread).param("author",p.id())
                .param("body",body).param("ticket",r.ticketId()).update();
        String preview=preview(body,r.ticketId());
        if(p.role().equals("ADMIN")){
            notifier.send(thread,r.ticketId(),"STAFF_MESSAGE","Mensaje de administración",preview);
        } else {
            notifier.sendToAdmins(r.ticketId(),"STAFF_MESSAGE","Mensaje de "+displayName(p.id()),preview,p.id());
        }
        events.audit(p.id(),"STAFF_MESSAGE","USER",thread,Map.of("preview",preview));
        realtime.notifyMessage(thread,p.id());
        return Map.of("id",id);
    }

    void authorizeMessage(UUID messageId,UserPrincipal p){
        Map<String,Object> row=db.sql("select agent_id from staff_messages where id=:id").param("id",messageId)
                .query().listOfRows().stream().findFirst()
                .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Message not found"));
        if(p.role().equals("ADMIN")) return;
        if(!p.id().toString().equals(Objects.toString(row.get("agent_id"),"")))
            throw new AccessDeniedException("Message is outside your conversation");
    }

    private void attachFiles(List<Map<String,Object>> messages){
        for(Map<String,Object> message:messages){
            message.put("attachments",db.sql("""
                    select id,original_name as "fileName",content_type as "contentType",size_bytes as "sizeBytes"
                    from staff_message_attachments where message_id=:id order by created_at
                    """).param("id",message.get("id")).query().listOfRows());
        }
    }

    private UUID threadOwner(UUID requested,UserPrincipal p){
        if(!p.role().equals("ADMIN")) return p.id();
        if(requested==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"agentId required");
        if(requested.equals(p.id())) throw new AccessDeniedException("Choose another person");
        boolean exists=db.sql("select count(*) from users where id=:id and active=true")
                .param("id",requested).query(Long.class).single()>0;
        if(!exists) throw new AccessDeniedException("User is not available");
        return requested;
    }

    private void authorizeTicket(UUID ticketId,UserPrincipal p){
        Map<String,Object> ticket=db.sql("select requester_id,assignee_id,team_id from tickets where id=:id")
                .param("id",ticketId).query().listOfRows().stream().findFirst()
                .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Ticket not found"));
        if(p.role().equals("ADMIN")) return;
        if(p.role().equals("EMPLOYEE")&&p.id().toString().equals(Objects.toString(ticket.get("requester_id"),""))) return;
        if(p.role().equals("SUPPORT_AGENT")){
            boolean assigned=p.id().toString().equals(Objects.toString(ticket.get("assignee_id"),""));
            boolean team=ticket.get("team_id")!=null&&db.sql("select count(*) from team_members where team_id=:team and user_id=:user")
                    .param("team",ticket.get("team_id")).param("user",p.id()).query(Long.class).single()>0;
            if(assigned||team) return;
        }
        throw new AccessDeniedException("Ticket is outside your access");
    }

    private String preview(String body,UUID ticketId){
        if(!body.isBlank()) return body.length()>160?body.substring(0,157)+"...":body;
        if(ticketId!=null){
            return db.sql("select 'Ticket '||number from tickets where id=:id").param("id",ticketId)
                    .query(String.class).list().stream().findFirst().orElse("Ticket adjunto");
        }
        return "Archivo adjunto";
    }

    private String displayName(UUID id){
        return db.sql("select display_name from users where id=:id").param("id",id).query(String.class).single();
    }

    public record MessageRequest(@Size(max=4000) String body, UUID agentId, UUID ticketId){}
}
