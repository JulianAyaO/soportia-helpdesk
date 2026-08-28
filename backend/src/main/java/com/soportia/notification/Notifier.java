package com.soportia.notification;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class Notifier {
    private final JdbcClient db;
    public Notifier(JdbcClient db){this.db=db;}

    public void send(UUID userId,UUID ticketId,String type,String title,String body){
        if(userId==null) return;
        db.sql("""
                insert into notifications(id,user_id,ticket_id,type,title,body)
                values(:id,:uid,:tid,:type,:title,:body)
                """).param("id",UUID.randomUUID()).param("uid",userId).param("tid",ticketId)
                .param("type",type).param("title",title).param("body",body).update();
    }

    public void sendToTeam(UUID teamId,UUID ticketId,String type,String title,String body,UUID except){
        if(teamId==null) return;
        for(UUID user:members(teamId)){
            if(except!=null&&except.equals(user)) continue;
            send(user,ticketId,type,title,body);
        }
    }

    public void sendToAdmins(UUID ticketId,String type,String title,String body){
        sendToAdmins(ticketId,type,title,body,null);
    }

    public void sendToAdmins(UUID ticketId,String type,String title,String body,UUID except){
        for(UUID user:db.sql("select id from users where role='ADMIN' and active=true").query(UUID.class).list()){
            if(except!=null&&except.equals(user)) continue;
            send(user,ticketId,type,title,body);
        }
    }

    public List<UUID> members(UUID teamId){
        return db.sql("""
                select u.id from users u join team_members m on m.user_id=u.id
                where m.team_id=:team and u.active=true and u.role='SUPPORT_AGENT'
                """).param("team",teamId).query(UUID.class).list();
    }
}
