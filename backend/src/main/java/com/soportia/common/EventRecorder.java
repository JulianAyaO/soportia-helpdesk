package com.soportia.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

@Component
public class EventRecorder {
    private final JdbcClient db; private final ObjectMapper json;
    public EventRecorder(JdbcClient db,ObjectMapper json){this.db=db;this.json=json;}
    public void outbox(String type,UUID aggregateId,Map<String,Object> payload){
        try {
            UUID eventId=UUID.randomUUID();
            String envelope=json.writeValueAsString(Map.of(
                    "eventId",eventId,
                    "eventType",type,
                    "eventVersion",1,
                    "occurredAt",OffsetDateTime.now(ZoneOffset.UTC),
                    "payload",payload
            ));
            db.sql("""
                    insert into outbox_events(id,aggregate_type,aggregate_id,event_type,payload)
                    values(:id,'TICKET',:aid,:type,:payload)
                    """)
                    .param("id",eventId).param("aid",aggregateId).param("type",type)
                    .param("payload",envelope).update();
        } catch(Exception e){throw new IllegalStateException(e);}
    }
    public void history(UUID ticketId,UUID actor,String type,String oldValue,String newValue){
        db.sql("""
                insert into ticket_history(id,ticket_id,actor_id,event_type,old_value,new_value)
                values(:id,:t,:a,:e,:o,:n)
                """).param("id",UUID.randomUUID()).param("t",ticketId)
                .param("a",actor).param("e",type).param("o",oldValue).param("n",newValue).update();
    }
    public void audit(UUID actor,String action,String resourceType,Object resourceId,Map<String,Object> details){
        try {
            db.sql("""
                    insert into audit_logs(id,actor_id,action,resource_type,resource_id,details)
                    values(:id,:a,:x,:rt,:rid,:d)
                    """).param("id",UUID.randomUUID()).param("a",actor)
                    .param("x",action).param("rt",resourceType).param("rid",resourceId==null?null:resourceId.toString())
                    .param("d",json.writeValueAsString(details)).update();
        } catch(Exception e){throw new IllegalStateException(e);}
    }
}
