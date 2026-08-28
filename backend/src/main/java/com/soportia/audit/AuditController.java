package com.soportia.audit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/audit")
@PreAuthorize("hasRole('ADMIN')")
public class AuditController {
    private final JdbcClient db;
    private final ObjectMapper json;
    public AuditController(JdbcClient db,ObjectMapper json){this.db=db;this.json=json;}

    @GetMapping
    public Map<String,Object> list(@RequestParam(defaultValue="0") int page,
                                   @RequestParam(defaultValue="50") int size,
                                   @RequestParam(required=false) String action,
                                   @RequestParam(required=false) String query){
        size=Math.max(1,Math.min(size,100)); page=Math.max(page,0);
        String filter="";
        if(action!=null&&!action.isBlank()) filter+=" and a.action=:action";
        if(query!=null&&!query.isBlank()) filter+=" and (lower(u.email) like :q or lower(u.display_name) like :q or lower(coalesce(t.number,'')) like :q)";
        var spec=db.sql("""
                select a.id,a.action,a.resource_type as "resourceType",
                a.resource_id as "resourceId",a.details,a.created_at as "createdAt",
                u.email as "actorEmail",u.display_name as "actorName",t.number as "ticketNumber"
                from audit_logs a
                left join users u on u.id=a.actor_id
                left join tickets t on a.resource_type='TICKET' and t.id::text=a.resource_id
                where 1=1
                """+filter+" order by a.created_at desc limit :s offset :o")
                .param("s",size).param("o",page*size);
        var count=db.sql("""
                select count(*) from audit_logs a
                left join users u on u.id=a.actor_id
                left join tickets t on a.resource_type='TICKET' and t.id::text=a.resource_id
                where 1=1
                """+filter);
        if(action!=null&&!action.isBlank()){spec=spec.param("action",action);count=count.param("action",action);}
        if(query!=null&&!query.isBlank()){
            String like="%"+query.toLowerCase().trim()+"%";
            spec=spec.param("q",like);count=count.param("q",like);
        }
        List<Map<String,Object>> content=spec.query().listOfRows();
        for(Map<String,Object> row:content){
            Map<String,Object> details=parseDetails(row.get("details"));
            row.put("details",details);
            row.put("summary",summary(row,details));
        }
        long total=count.query(Long.class).single();
        return Map.of("content",content,"page",page,"size",size,"totalElements",total);
    }

    private Map<String,Object> parseDetails(Object raw){
        if(raw instanceof Map<?,?> map){
            Map<String,Object> copy=new LinkedHashMap<>();
            map.forEach((k,v)->copy.put(String.valueOf(k),v));
            return copy;
        }
        try{return json.readValue(String.valueOf(raw==null?"{}":raw),new TypeReference<>(){});}
        catch(Exception ex){return Map.of();}
    }

    private String summary(Map<String,Object> row,Map<String,Object> details){
        String actor=string(row.get("actorName"));
        if(actor.isBlank()) actor=string(row.get("actorEmail"));
        if(actor.isBlank()) actor="El sistema";
        String ticket=string(row.get("ticketNumber"));
        if(ticket.isBlank()) ticket=string(details.get("number"));
        return switch(String.valueOf(row.get("action"))){
            case "LOGIN" -> actor+" inició sesión.";
            case "LOGOUT" -> actor+" cerró sesión.";
            case "TICKET_CREATED" -> actor+" creó el ticket "+or(ticket,"nuevo")+".";
            case "TICKET_COMMENTED" -> actor+" comentó en "+or(ticket,"un ticket")+".";
            case "TICKET_ASSIGNED" -> actor+" cambió la asignación de "+or(ticket,"un ticket")+".";
            case "TICKET_TRANSITIONED" -> actor+" cambió el estado de "+or(ticket,"un ticket")
                    +(details.get("to")==null?"":" a "+statusLabel(String.valueOf(details.get("to"))))+".";
            case "AUTOMATION_ROUTED" -> "La automatización envió "+or(ticket,"un ticket")+" a otro equipo.";
            case "AUTOMATION_UPDATED" -> actor+" actualizó una regla de automatización.";
            case "STAFF_MESSAGE" -> actor+" envió un mensaje interno.";
            case "USER_CREATED" -> actor+" creó la cuenta "+string(details.get("email"))+".";
            case "USER_ACTIVATED" -> actor+" reactivó una cuenta.";
            case "USER_DEACTIVATED" -> actor+" desactivó una cuenta.";
            case "USER_TEAM_CHANGED" -> actor+" cambió el equipo de un agente.";
            default -> actor+" registró la acción "+row.get("action")+".";
        };
    }

    private static String statusLabel(String status){
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
    private static String string(Object value){return value==null?"":value.toString();}
    private static String or(String value,String fallback){return value==null||value.isBlank()?fallback:value;}
}
