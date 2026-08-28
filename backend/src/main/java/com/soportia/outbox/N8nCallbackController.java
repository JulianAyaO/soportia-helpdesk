package com.soportia.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soportia.common.EventRecorder;
import com.soportia.notification.Notifier;
import com.soportia.ticket.BusinessHours;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/n8n")
public class N8nCallbackController {
    static final String BOT_EMAIL = "automation@soportia.local";
    private final JdbcClient db;
    private final ObjectMapper json;
    private final EventRecorder events;
    private final Notifier notifier;
    private final N8nHmac hmac;

    public N8nCallbackController(JdbcClient db, ObjectMapper json, EventRecorder events, Notifier notifier, N8nHmac hmac) {
        this.db = db;
        this.json = json;
        this.events = events;
        this.notifier = notifier;
        this.hmac = hmac;
    }

    @GetMapping("/tickets/waiting")
    public Map<String, Object> waiting(@RequestHeader("X-Soportia-Timestamp") long timestamp,
                                       @RequestHeader("X-Soportia-Signature") String signature,
                                       @RequestParam(defaultValue = "2") int hours,
                                       HttpServletRequest request) {
        hmac.verify(timestamp, signature, hmac.canonicalGet(request));
        int window = Math.min(168, Math.max(1, hours));
        OffsetDateTime cutoff = OffsetDateTime.now().minusHours(window);
        List<Map<String, Object>> tickets = db.sql("""
                select t.id, t.number, t.title, t.status, t.updated_at as "updatedAt",
                       t.requester_id as "requesterId", t.assignee_id as "assigneeId"
                from tickets t
                where t.status = 'WAITING_FOR_REQUESTER'
                  and t.updated_at <= :cutoff
                order by t.updated_at
                limit 50
                """).param("cutoff", cutoff).query().listOfRows();
        return Map.of("hours", window, "tickets", tickets);
    }

    @GetMapping("/tickets/{id}")
    public Map<String, Object> ticket(@PathVariable UUID id,
                                      @RequestHeader("X-Soportia-Timestamp") long timestamp,
                                      @RequestHeader("X-Soportia-Signature") String signature,
                                      HttpServletRequest request) {
        hmac.verify(timestamp, signature, hmac.canonicalGet(request));
        Map<String, Object> ticket = db.sql("""
                select id, number, title, status, priority, team_id as "teamId",
                       assignee_id as "assigneeId", requester_id as "requesterId",
                       updated_at as "updatedAt"
                from tickets where id = :id
                """).param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket not found"));
        return ticket;
    }

    @GetMapping("/teams/{teamId}/agents")
    public Map<String, Object> agents(@PathVariable UUID teamId,
                                      @RequestHeader("X-Soportia-Timestamp") long timestamp,
                                      @RequestHeader("X-Soportia-Signature") String signature,
                                      HttpServletRequest request) {
        hmac.verify(timestamp, signature, hmac.canonicalGet(request));
        db.sql("select id from teams where id=:id").param("id", teamId).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team not found"));
        List<Map<String, Object>> agents = db.sql("""
                select u.id, u.display_name as "displayName",
                       (select count(*) from tickets t
                        where t.assignee_id = u.id
                          and t.status not in ('RESOLVED','CLOSED','CANCELLED')) as "openCount"
                from users u
                join team_members m on m.user_id = u.id
                where m.team_id = :team and u.active = true and u.role = 'SUPPORT_AGENT'
                order by 3 asc, u.display_name
                """).param("team", teamId).query().listOfRows();
        return Map.of("teamId", teamId, "agents", agents);
    }

    @PostMapping("/callback")
    @Transactional
    public Map<String, Object> callback(@RequestHeader("X-Soportia-Timestamp") long timestamp,
                                        @RequestHeader("X-Soportia-Signature") String signature,
                                        @RequestHeader("X-Idempotency-Key") String key,
                                        @RequestBody String body) {
        hmac.verify(timestamp, signature, body);
        if (key.isBlank() || key.length() > 150) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid idempotency key");
        }
        var existing = db.sql("select id,status,result from automation_executions where idempotency_key=:k")
                .param("k", key).query().listOfRows().stream().findFirst();
        if (existing.isPresent()) return existing.get();
        CallbackRequest request = parse(body);
        if (request.automationId() == null || request.status() == null || request.status().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "automationId and status are required");
        }
        db.sql("select id from automations where id=:id").param("id", request.automationId()).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Automation not found"));

        apply(request);
        UUID id = UUID.randomUUID();
        db.sql("""
                insert into automation_executions(id,automation_id,event_id,status,idempotency_key,result,duration_ms,completed_at)
                values(:id,:automation,:event,:status,:key,:result,:duration,CURRENT_TIMESTAMP)
                """)
                .param("id", id).param("automation", request.automationId()).param("event", request.eventId())
                .param("status", request.status()).param("key", key).param("result", request.result())
                .param("duration", request.durationMs() == null ? 0L : request.durationMs()).update();
        return Map.of("id", id, "status", request.status(), "idempotencyKey", key);
    }

    private void apply(CallbackRequest request) {
        if (request.ticketId() == null || !"SUCCESS".equals(request.status())) return;
        var ticket = db.sql("select * from tickets where id=:id")
                .param("id", request.ticketId()).query().listOfRows().stream().findFirst().orElse(null);
        if (ticket == null) return;
        String number = String.valueOf(ticket.get("number"));
        String title = String.valueOf(ticket.getOrDefault("title", ""));
        String status = String.valueOf(ticket.get("status"));
        if (request.teamId() != null) {
            db.sql("select id from teams where id=:id").param("id", request.teamId()).query().listOfRows().stream().findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown routing team"));
            db.sql("update tickets set team_id=:team,updated_at=CURRENT_TIMESTAMP,version=version+1 where id=:ticket")
                    .param("team", request.teamId()).param("ticket", request.ticketId()).update();
            events.history(request.ticketId(), null, "AUTOMATION_ROUTED", null, request.teamId().toString());
            events.audit(null, "AUTOMATION_ROUTED", "TICKET", request.ticketId(), Map.of("teamId", request.teamId()));
            if (!request.teamId().toString().equals(String.valueOf(ticket.get("team_id")))) {
                notifier.sendToTeam(request.teamId(), request.ticketId(), "TICKET_CREATED",
                        "Nuevo ticket en tu cola: " + number, title, null);
            }
        }
        UUID previousAssignee = asUuid(ticket.get("assignee_id"));
        UUID assignedTo = previousAssignee;
        boolean reassigned = false;
        boolean replaceAssignee = ticket.get("assignee_id") == null || Boolean.TRUE.equals(request.forceAssign());
        if (request.assigneeId() != null && replaceAssignee && canTouchOpen(status, request.forceAssign())) {
            db.sql("select id from users where id=:id and active=true and role='SUPPORT_AGENT'")
                    .param("id", request.assigneeId()).query().listOfRows().stream().findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown routing agent"));
            db.sql("update tickets set assignee_id=:agent,updated_at=CURRENT_TIMESTAMP,version=version+1 where id=:ticket")
                    .param("agent", request.assigneeId()).param("ticket", request.ticketId()).update();
            events.history(request.ticketId(), null, "AUTOMATION_ASSIGNED", null, request.assigneeId().toString());
            assignedTo = request.assigneeId();
            reassigned = previousAssignee == null || !previousAssignee.equals(request.assigneeId());
            if (reassigned) {
                notifier.send(request.assigneeId(), request.ticketId(), "TICKET_ASSIGNED",
                        "Te asignaron " + number, "La automatización te asignó este ticket.");
            }
        }
        String fromPriority = String.valueOf(ticket.get("priority"));
        String toPriority = fromPriority;
        if (Boolean.TRUE.equals(request.bumpPriority()) && "OPEN".equals(status)) {
            toPriority = bumpPriority(request.ticketId(), ticket);
        }
        if (Boolean.TRUE.equals(request.notifyAdmin()) && "OPEN".equals(status)) {
            notifySlaAgents(ticket, fromPriority, toPriority, assignedTo, reassigned);
        }
        if (request.comment() != null && !request.comment().isBlank()) {
            addBotComment(request.ticketId(), ticket, request.comment().trim(), "AUTOMATION_COMMENTED");
        }
        if (Boolean.TRUE.equals(request.reminder()) && "WAITING_FOR_REQUESTER".equals(status)) {
            UUID requester = asUuid(ticket.get("requester_id"));
            notifier.send(requester, request.ticketId(), "TICKET_REPLY",
                    "Recordatorio: " + number + " espera tu respuesta",
                    "El técnico necesita tu comentario para continuar.");
            addBotComment(request.ticketId(), ticket,
                    "Hola, el ticket sigue en espera de tu respuesta. Cuando puedas, comenta aquí para que el técnico continúe.",
                    "AUTOMATION_REMINDED");
        }
    }

    private boolean canTouchOpen(String status, Boolean forceAssign) {
        if (Boolean.TRUE.equals(forceAssign)) return "OPEN".equals(status);
        return List.of("OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER").contains(status);
    }

    private String bumpPriority(UUID ticketId, Map<String, Object> ticket) {
        String current = String.valueOf(ticket.get("priority"));
        String next = switch (current) {
            case "LOW" -> "MEDIUM";
            case "MEDIUM" -> "HIGH";
            case "HIGH" -> "CRITICAL";
            default -> "CRITICAL";
        };
        if (next.equals(current)) return current;
        var sla = db.sql("select id,resolution_minutes from sla_policies where priority=:p and active=true")
                .param("p", next).query().listOfRows().stream().findFirst().orElse(null);
        var spec = db.sql("""
                update tickets set priority=:p, sla_policy_id=coalesce(:sla, sla_policy_id),
                resolution_due_at=coalesce(:due, resolution_due_at),
                updated_at=CURRENT_TIMESTAMP, version=version+1 where id=:id
                """).param("p", next).param("id", ticketId);
        if (sla != null) {
            OffsetDateTime created = BusinessHours.toOffset(ticket.get("created_at"));
            spec = spec.param("sla", sla.get("id"))
                    .param("due", BusinessHours.addMinutes(created, ((Number) sla.get("resolution_minutes")).longValue()));
        } else {
            spec = spec.param("sla", null).param("due", ticket.get("resolution_due_at"));
        }
        spec.update();
        events.history(ticketId, null, "AUTOMATION_ESCALATED", current, next);
        events.audit(null, "AUTOMATION_ESCALATED", "TICKET", ticketId, Map.of("from", current, "to", next));
        UUID requester = asUuid(ticket.get("requester_id"));
        notifier.send(requester, ticketId, "TICKET_STATUS",
                "Prioridad actualizada en " + ticket.get("number"),
                "La automatización subió la prioridad por riesgo de SLA.");
        return next;
    }

    private void notifySlaAgents(Map<String, Object> ticket, String fromPriority, String toPriority,
                                 UUID assigneeId, boolean reassigned) {
        String number = String.valueOf(ticket.get("number"));
        StringBuilder body = new StringBuilder("El ticket seguía abierto cerca del plazo.");
        if (!fromPriority.equals(toPriority)) {
            body.append(" La prioridad subió de ").append(priorityEs(fromPriority))
                    .append(" a ").append(priorityEs(toPriority)).append(".");
        }
        if (reassigned && assigneeId != null) {
            body.append(" Se reasignó a ").append(displayName(assigneeId)).append(".");
        } else if (assigneeId == null) {
            body.append(" Sigue en la cola del equipo, sin asignar.");
        }
        UUID ticketId = asUuid(ticket.get("id"));
        String title = "Escalación SLA en " + number;
        if (isSupportAgent(assigneeId)) {
            notifier.send(assigneeId, ticketId, "TICKET_STATUS", title, body.toString());
            return;
        }
        UUID teamId = asUuid(ticket.get("team_id"));
        notifier.sendToTeam(teamId, ticketId, "TICKET_STATUS", title, body.toString(), null);
    }

    private boolean isSupportAgent(UUID userId) {
        if (userId == null) return false;
        return db.sql("select count(*) from users where id=:id and role='SUPPORT_AGENT' and active=true")
                .param("id", userId).query(Long.class).single() > 0;
    }

    private String displayName(UUID userId) {
        return db.sql("select display_name from users where id=:id").param("id", userId)
                .query(String.class).list().stream().findFirst().orElse("un agente");
    }

    private static String priorityEs(String priority) {
        return switch (priority) {
            case "LOW" -> "Baja";
            case "MEDIUM" -> "Media";
            case "HIGH" -> "Alta";
            case "CRITICAL" -> "Crítica";
            default -> priority;
        };
    }

    private void addBotComment(UUID ticketId, Map<String, Object> ticket, String body, String historyType) {
        long exists = db.sql("select count(*) from comments where ticket_id=:t and body=:b")
                .param("t", ticketId).param("b", body).query(Long.class).single();
        if (exists > 0) return;
        UUID author = botId();
        UUID commentId = UUID.randomUUID();
        db.sql("insert into comments(id,ticket_id,author_id,body,visibility) values(:id,:t,:a,:b,'PUBLIC')")
                .param("id", commentId).param("t", ticketId).param("a", author).param("b", body).update();
        events.history(ticketId, author, historyType, null, "PUBLIC");
        UUID requester = asUuid(ticket.get("requester_id"));
        if (requester != null && !requester.equals(author)) {
            String preview = body.length() > 160 ? body.substring(0, 157) + "..." : body;
            notifier.send(requester, ticketId, "TICKET_REPLY", "Nueva respuesta en " + ticket.get("number"), preview);
        }
    }

    private UUID botId() {
        return db.sql("select id from users where lower(email)=lower(:e)")
                .param("e", BOT_EMAIL).query(UUID.class).list().stream().findFirst()
                .orElseGet(() -> db.sql("select id from users where role='ADMIN' and active=true order by created_at limit 1")
                        .query(UUID.class).single());
    }

    private static UUID asUuid(Object value) {
        if (value instanceof UUID uuid) return uuid;
        if (value == null) return null;
        try { return UUID.fromString(value.toString()); }
        catch (IllegalArgumentException ex) { return null; }
    }

    private CallbackRequest parse(String body) {
        try { return json.readValue(body, CallbackRequest.class); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid callback payload"); }
    }

    /** notifyAdmin is the n8n field name; Spring notifies the assignee or team agents, not administrators. */
    public record CallbackRequest(UUID automationId, UUID eventId, String status, String result, Long durationMs,
                                  UUID ticketId, UUID teamId, UUID assigneeId, Boolean forceAssign,
                                  Boolean bumpPriority, Boolean notifyAdmin, String comment, Boolean reminder) {}
}
