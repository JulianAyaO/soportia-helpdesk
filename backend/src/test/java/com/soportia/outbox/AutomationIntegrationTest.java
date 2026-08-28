package com.soportia.outbox;

import com.jayway.jsonpath.JsonPath;
import com.soportia.sla.SlaMonitor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AutomationIntegrationTest {
    private static final String SECRET="local-n8n-secret";
    private static final UUID SUPPORT=UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID AGENT=UUID.fromString("10000000-0000-0000-0000-000000000002");
    private static final UUID ADMIN=UUID.fromString("10000000-0000-0000-0000-000000000003");
    private static final UUID AUTO_ROUTE=UUID.fromString("60000000-0000-0000-0000-000000000001");
    private static final UUID SLA_ALERT=UUID.fromString("60000000-0000-0000-0000-000000000002");
    private static final UUID WAITING_REMINDER=UUID.fromString("60000000-0000-0000-0000-000000000003");
    private static final UUID KEYWORD_REPLY=UUID.fromString("60000000-0000-0000-0000-000000000004");
    @Autowired MockMvc mvc;
    @Autowired JdbcClient db;
    @Autowired SlaMonitor slaMonitor;

    @Test void signedCallbackRoutesTicketAndIsIdempotent() throws Exception {
        String token=login();
        String ticketId=createTicket(token,"Automation callback","Verify routing");
        UUID eventId=createdEvent(ticketId);
        String body=callback(AUTO_ROUTE,eventId,ticketId,"""
                "teamId":"20000000-0000-0000-0000-000000000002","result":"routed"
                """);
        long timestamp=Instant.now().getEpochSecond();
        String key=eventId+":auto-route-test";

        String first=mvc.perform(post("/api/v1/integrations/n8n/callback")
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,body))
                        .header("X-Idempotency-Key",key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUCCESS"))
                .andReturn().getResponse().getContentAsString();
        String second=mvc.perform(post("/api/v1/integrations/n8n/callback")
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,body))
                        .header("X-Idempotency-Key",key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(JsonPath.<String>read(second,"$.id")).isEqualTo(JsonPath.read(first,"$.id"));
        UUID team=db.sql("select team_id from tickets where id=:id")
                .param("id",UUID.fromString(ticketId)).query(UUID.class).single();
        assertThat(team).isEqualTo(UUID.fromString("20000000-0000-0000-0000-000000000002"));
        assertThat(db.sql("select count(*) from automation_executions where idempotency_key=:key")
                .param("key",key).query(Long.class).single()).isOne();
    }

    @Test void slaMonitorRecordsAndPublishesBreachOnce() throws Exception {
        String token=login();
        UUID ticketId=UUID.fromString(createTicket(token,"SLA breach","Verify monitor"));
        OffsetDateTime now=OffsetDateTime.now(ZoneOffset.UTC);
        db.sql("update tickets set created_at=:created,resolution_due_at=:due where id=:id")
                .param("created",now.minusHours(3)).param("due",now.minusMinutes(1)).param("id",ticketId).update();

        slaMonitor.detectResolutionRisk();
        slaMonitor.detectResolutionRisk();

        assertThat(db.sql("select count(*) from sla_events where ticket_id=:id and event_type='RESOLUTION_BREACHED'")
                .param("id",ticketId).query(Long.class).single()).isOne();
        assertThat(db.sql("select count(*) from outbox_events where aggregate_id=:id and event_type='ticket.sla.breached'")
                .param("id",ticketId).query(Long.class).single()).isOne();
    }

    @Test void signedGetRequiresValidHmac() throws Exception {
        long timestamp=Instant.now().getEpochSecond();
        mvc.perform(get("/api/v1/integrations/n8n/teams/{teamId}/agents",SUPPORT)
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature","sha256=deadbeef"))
                .andExpect(status().isUnauthorized());
        String canonical="GET /api/v1/integrations/n8n/teams/"+SUPPORT+"/agents";
        mvc.perform(get("/api/v1/integrations/n8n/teams/{teamId}/agents",SUPPORT)
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,canonical)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.agents").isArray());
    }

    @Test void agentsAreOrderedByOpenCount() throws Exception {
        UUID extra=UUID.fromString("10000000-0000-0000-0000-0000000000aa");
        db.sql("""
                insert into users(id,email,password_hash,display_name,role,active)
                select :id,'load-agent@soportia.local','x','Agente libre','SUPPORT_AGENT',true
                where not exists (select 1 from users where id=:id)
                """).param("id",extra).update();
        db.sql("""
                insert into team_members(team_id,user_id) select :t,:u
                where not exists (select 1 from team_members where team_id=:t and user_id=:u)
                """).param("t",SUPPORT).param("u",extra).update();
        String canonical="GET /api/v1/integrations/n8n/teams/"+SUPPORT+"/agents";
        long timestamp=Instant.now().getEpochSecond();
        String body=mvc.perform(get("/api/v1/integrations/n8n/teams/{teamId}/agents",SUPPORT)
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,canonical)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(body,"$.agents[0].id")).isEqualTo(extra.toString());
        assertThat((Number)JsonPath.read(body,"$.agents[0].openCount")).isEqualTo(0);
    }

    @Test void signedGetReturnsTicketSnapshot() throws Exception {
        String token=login();
        String ticketId=createTicket(token,"Snapshot","n8n GET ticket");
        String canonical="GET /api/v1/integrations/n8n/tickets/"+ticketId;
        long timestamp=Instant.now().getEpochSecond();
        mvc.perform(get("/api/v1/integrations/n8n/tickets/{id}",ticketId)
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,canonical)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.id").value(ticketId));
    }

    @Test void waitingListUsesCutoffAndHmac() throws Exception {
        String token=login();
        UUID ticketId=UUID.fromString(createTicket(token,"Waiting list","Need a reply"));
        db.sql("update tickets set status='WAITING_FOR_REQUESTER',updated_at=:ago where id=:id")
                .param("ago",OffsetDateTime.now(ZoneOffset.UTC).minusHours(3)).param("id",ticketId).update();
        String canonical="GET /api/v1/integrations/n8n/tickets/waiting?hours=2";
        long timestamp=Instant.now().getEpochSecond();
        String body=mvc.perform(get("/api/v1/integrations/n8n/tickets/waiting?hours=2")
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,canonical)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).contains(ticketId.toString());
    }

    @Test void callbackAssignsLeastLoadedAgent() throws Exception {
        String token=login();
        String ticketId=createTicket(token,"Load assign","Give it to an agent");
        UUID eventId=createdEvent(ticketId);
        String body=callback(AUTO_ROUTE,eventId,ticketId,"""
                "teamId":"20000000-0000-0000-0000-000000000001",
                "assigneeId":"10000000-0000-0000-0000-000000000002",
                "result":"Assigned to Agente de accesos"
                """);
        postCallback(eventId+":assign-load",body);
        UUID assignee=db.sql("select assignee_id from tickets where id=:id")
                .param("id",UUID.fromString(ticketId)).query(UUID.class).single();
        assertThat(assignee).isEqualTo(AGENT);
        assertThat(db.sql("select count(*) from ticket_history where ticket_id=:id and event_type='AUTOMATION_ASSIGNED'")
                .param("id",UUID.fromString(ticketId)).query(Long.class).single()).isOne();
    }

    @Test void callbackBumpsPriorityOnOpenTicket() throws Exception {
        String token=login();
        UUID ticketId=UUID.fromString(createTicket(token,"Escalate me","Still in queue"));
        UUID eventId=createdEvent(ticketId.toString());
        String body=callback(SLA_ALERT,eventId,ticketId.toString(),"""
                "bumpPriority":true,"notifyAdmin":true,"result":"Escalated"
                """);
        postCallback(eventId+":sla-escalate",body);
        String priority=db.sql("select priority from tickets where id=:id").param("id",ticketId).query(String.class).single();
        assertThat(priority).isEqualTo("HIGH");
        assertThat(db.sql("select count(*) from ticket_history where ticket_id=:id and event_type='AUTOMATION_ESCALATED'")
                .param("id",ticketId).query(Long.class).single()).isOne();
        assertThat(db.sql("select count(*) from notifications where ticket_id=:id and user_id=:admin and title like 'Escalación SLA%'")
                .param("id",ticketId).param("admin",ADMIN).query(Long.class).single()).isZero();
        assertThat(db.sql("select count(*) from notifications where ticket_id=:id and user_id=:agent and title like 'Escalación SLA%'")
                .param("id",ticketId).param("agent",AGENT).query(Long.class).single()).isOne();
        String slaBody=db.sql("select body from notifications where ticket_id=:id and user_id=:agent and title like 'Escalación SLA%'")
                .param("id",ticketId).param("agent",AGENT).query(String.class).single();
        assertThat(slaBody).contains("Media").contains("Alta");
    }

    @Test void keywordCommentDoesNotSetFirstResponse() throws Exception {
        String token=login();
        UUID ticketId=UUID.fromString(createTicket(token,"Olvidé la contraseña","VPN no abre"));
        UUID eventId=createdEvent(ticketId.toString());
        String comment="Hola, prueba el restablecimiento de contraseña de la empresa.";
        String body=callback(KEYWORD_REPLY,eventId,ticketId.toString(),
                "\"comment\":"+quote(comment)+",\"result\":\"Published guided reply\"");
        postCallback(eventId+":keyword-reply",body);
        assertThat(db.sql("select first_response_at from tickets where id=:id").param("id",ticketId)
                .query().listOfRows().getFirst().get("first_response_at")).isNull();
        assertThat(db.sql("select count(*) from comments where ticket_id=:id and visibility='PUBLIC' and body=:b")
                .param("id",ticketId).param("b",comment).query(Long.class).single()).isOne();
        String status=db.sql("select status from tickets where id=:id").param("id",ticketId).query(String.class).single();
        assertThat(status).isEqualTo("OPEN");
        postCallback(eventId+":keyword-reply-2",body);
        assertThat(db.sql("select count(*) from comments where ticket_id=:id and body=:b")
                .param("id",ticketId).param("b",comment).query(Long.class).single()).isOne();
    }

    @Test void reminderOnlyWhenWaitingForRequester() throws Exception {
        String token=login();
        UUID openId=UUID.fromString(createTicket(token,"Still open","No reminder"));
        String openBody=callback(WAITING_REMINDER,null,openId.toString(),"\"reminder\":true,\"result\":\"skip\"");
        postCallback("waiting-reminder:"+openId,openBody);
        assertThat(db.sql("select count(*) from comments where ticket_id=:id")
                .param("id",openId).query(Long.class).single()).isZero();

        UUID waitingId=UUID.fromString(createTicket(token,"Need employee","Waiting"));
        db.sql("update tickets set status='WAITING_FOR_REQUESTER' where id=:id").param("id",waitingId).update();
        String waitBody=callback(WAITING_REMINDER,null,waitingId.toString(),"\"reminder\":true,\"result\":\"Reminded\"");
        postCallback("waiting-reminder:"+waitingId,waitBody);
        assertThat(db.sql("select count(*) from comments where ticket_id=:id")
                .param("id",waitingId).query(Long.class).single()).isOne();
        assertThat(db.sql("select count(*) from ticket_history where ticket_id=:id and event_type='AUTOMATION_REMINDED'")
                .param("id",waitingId).query(Long.class).single()).isOne();
        assertThat(db.sql("select count(*) from notifications where ticket_id=:id and title like 'Recordatorio:%'")
                .param("id",waitingId).query(Long.class).single()).isOne();
    }

    @Test void forceAssignAndBumpSkipWhenTicketAlreadyTaken() throws Exception {
        String token=login();
        UUID ticketId=UUID.fromString(createTicket(token,"Taken","Agent already working"));
        db.sql("update tickets set status='IN_PROGRESS',assignee_id=:a where id=:id")
                .param("a",AGENT).param("id",ticketId).update();
        UUID extra=UUID.fromString("10000000-0000-0000-0000-0000000000bb");
        db.sql("""
                insert into users(id,email,password_hash,display_name,role,active)
                select :id,'other-agent@soportia.local','x','Otro','SUPPORT_AGENT',true
                where not exists (select 1 from users where id=:id)
                """).param("id",extra).update();
        UUID eventId=createdEvent(ticketId.toString());
        String body=callback(SLA_ALERT,eventId,ticketId.toString(),
                "\"forceAssign\":true,\"assigneeId\":\""+extra+"\",\"bumpPriority\":true,\"notifyAdmin\":true,\"result\":\"noop\"");
        postCallback(eventId+":sla-taken",body);
        UUID assignee=db.sql("select assignee_id from tickets where id=:id").param("id",ticketId).query(UUID.class).single();
        String priority=db.sql("select priority from tickets where id=:id").param("id",ticketId).query(String.class).single();
        assertThat(assignee).isEqualTo(AGENT);
        assertThat(priority).isEqualTo("MEDIUM");
        assertThat(db.sql("select count(*) from ticket_history where ticket_id=:id and event_type in ('AUTOMATION_ASSIGNED','AUTOMATION_ESCALATED')")
                .param("id",ticketId).query(Long.class).single()).isZero();
    }

    private void postCallback(String key,String body) throws Exception {
        long timestamp=Instant.now().getEpochSecond();
        mvc.perform(post("/api/v1/integrations/n8n/callback")
                        .header("X-Soportia-Timestamp",timestamp)
                        .header("X-Soportia-Signature",signature(timestamp,body))
                        .header("X-Idempotency-Key",key)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    private String createTicket(String token,String title,String description) throws Exception {
        var created=mvc.perform(post("/api/v1/tickets").header("Authorization","Bearer "+token)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"title":%s,"description":%s,
                                "impact":2,"urgency":2,"categoryId":"30000000-0000-0000-0000-000000000001"}
                                """.formatted(quote(title),quote(description))))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(created.getResponse().getContentAsString(),"$.id");
    }

    private UUID createdEvent(String ticketId) {
        return db.sql("select id from outbox_events where aggregate_id=:id and event_type='ticket.created'")
                .param("id",UUID.fromString(ticketId)).query(UUID.class).single();
    }

    private static String callback(UUID automation,UUID eventId,String ticketId,String extra) {
        return """
                {"automationId":"%s","eventId":%s,"status":"SUCCESS","ticketId":"%s",%s}
                """.formatted(automation, eventId==null?"null":"\""+eventId+"\"", ticketId, extra).replace("\n","");
    }

    private String login() throws Exception {
        var login=mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"employee@soportia.local\",\"password\":\"Demo123!\"}"))
                .andExpect(status().isOk()).andReturn();
        return JsonPath.read(login.getResponse().getContentAsString(),"$.accessToken");
    }

    private static String quote(String value) {
        return "\""+value.replace("\\","\\\\").replace("\"","\\\"")+"\"";
    }

    private String signature(long timestamp,String body) throws Exception {
        Mac mac=Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return "sha256="+HexFormat.of().formatHex(
                mac.doFinal((timestamp+"."+body).getBytes(StandardCharsets.UTF_8)));
    }
}
