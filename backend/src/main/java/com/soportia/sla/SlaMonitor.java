package com.soportia.sla;

import com.soportia.common.EventRecorder;
import com.soportia.ticket.BusinessHours;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class SlaMonitor {
    private final JdbcClient db;
    private final EventRecorder events;

    public SlaMonitor(JdbcClient db, EventRecorder events) {
        this.db = db;
        this.events = events;
    }

    @Scheduled(initialDelay = 30_000, fixedDelayString = "${soportia.sla.monitor-delay-ms:60000}")
    @Transactional
    public void detectResolutionRisk() {
        List<Map<String, Object>> tickets = db.sql("""
                select id, number, status, created_at, resolution_due_at
                from tickets
                where status not in ('RESOLVED','CLOSED','CANCELLED')
                  and resolution_due_at is not null
                """).query().listOfRows();

        for (Map<String, Object> ticket : tickets) {
            UUID ticketId = (UUID) ticket.get("id");
            OffsetDateTime createdAt = BusinessHours.toOffset(ticket.get("created_at"));
            OffsetDateTime dueAt = BusinessHours.toOffset(ticket.get("resolution_due_at"));
            OffsetDateTime now=OffsetDateTime.now();
            boolean breached=!dueAt.isAfter(now);
            boolean atRisk=Duration.between(createdAt,now).toMillis()>=
                    Duration.between(createdAt,dueAt).toMillis()*0.8;
            if(!breached&&!atRisk)continue;
            String eventType=breached?"RESOLUTION_BREACHED":"RESOLUTION_AT_RISK";
            long alreadyRecorded=db.sql("select count(*) from sla_events where ticket_id=:ticket and event_type=:type")
                    .param("ticket",ticketId).param("type",eventType).query(Long.class).single();
            if(alreadyRecorded>0)continue;
            db.sql("""
                    insert into sla_events(id,ticket_id,event_type,due_at)
                    values(:id,:ticket,:type,:due)
                    """).param("id", UUID.randomUUID()).param("ticket", ticketId)
                    .param("type", eventType).param("due", dueAt).update();
            events.history(ticketId, null, eventType, null, dueAt.toString());
            events.outbox(eventType.equals("RESOLUTION_BREACHED") ? "ticket.sla.breached" : "ticket.sla.at_risk",
                    ticketId, Map.of("ticketId", ticketId, "deadline", dueAt, "slaStatus", eventType,
                            "number", String.valueOf(ticket.get("number")),
                            "status", String.valueOf(ticket.get("status"))));
        }
    }
}
