package com.soportia.outbox;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class OutboxPublisher {
    private final JdbcClient db; private final RestClient http; private final String routingUrl; private final String slaUrl;
    private final String secret; private final int maxAttempts;
    public OutboxPublisher(JdbcClient db,RestClient.Builder builder,
                           @Value("${soportia.n8n.routing-webhook-url}") String routingUrl,
                           @Value("${soportia.n8n.sla-webhook-url}") String slaUrl,
                           @Value("${soportia.n8n.hmac-secret}") String secret,
                           @Value("${soportia.n8n.max-attempts}") int maxAttempts){
        this.db=db;this.http=builder.build();this.routingUrl=routingUrl;this.slaUrl=slaUrl;
        this.secret=secret;this.maxAttempts=maxAttempts;
    }
    @Scheduled(fixedDelayString="${soportia.n8n.publisher-delay-ms}")
    public void publish(){
        if((routingUrl==null||routingUrl.isBlank())&&(slaUrl==null||slaUrl.isBlank()))return;
        List<Map<String,Object>> rows=db.sql("""
                select id,event_type,payload,attempts from outbox_events
                where status='PENDING' and next_attempt_at<=CURRENT_TIMESTAMP order by created_at limit 20
                """).query().listOfRows();
        for(Map<String,Object> row:rows) send(row);
    }
    private void send(Map<String,Object> row){
        UUID id=(UUID)row.get("id"); String payload=row.get("payload").toString(); int attempts=((Number)row.get("attempts")).intValue()+1;
        try {
            String eventType=row.get("event_type").toString();
            String url=webhookUrl(eventType);
            if(url==null){
                db.sql("update outbox_events set status='PUBLISHED',attempts=:a,published_at=CURRENT_TIMESTAMP where id=:id")
                        .param("a",attempts).param("id",id).update();
                return;
            }
            if(url.isBlank())return;
            long timestamp=OffsetDateTime.now(ZoneOffset.UTC).toEpochSecond();
            http.post().uri(url).contentType(MediaType.APPLICATION_JSON)
                    .header("X-Soportia-Event-Id",id.toString())
                    .header("X-Soportia-Timestamp",Long.toString(timestamp))
                    .header("X-Soportia-Signature","sha256="+hmac(timestamp+"."+payload))
                    .body(payload).retrieve().toBodilessEntity();
            db.sql("update outbox_events set status='PUBLISHED',attempts=:a,published_at=CURRENT_TIMESTAMP where id=:id")
                    .param("a",attempts).param("id",id).update();
        } catch(Exception ignored) {
            String status=attempts>=maxAttempts?"DEAD":"PENDING";
            long delay=Math.min(3600L,1L<<Math.min(attempts,11));
            db.sql("update outbox_events set status=:s,attempts=:a,next_attempt_at=:next where id=:id")
                    .param("s",status).param("a",attempts)
                    .param("next", OffsetDateTime.now(ZoneOffset.UTC).plus(delay,ChronoUnit.SECONDS))
                    .param("id",id).update();
        }
    }
    private String webhookUrl(String eventType){
        if(eventType.startsWith("ticket.sla.")) return slaUrl;
        if("ticket.created".equals(eventType)) return routingUrl;
        return null;
    }
    private String hmac(String body)throws Exception{
        Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }
}
