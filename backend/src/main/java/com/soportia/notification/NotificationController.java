package com.soportia.notification;

import com.soportia.config.SecurityConfig.UserPrincipal;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final JdbcClient db;
    public NotificationController(JdbcClient db){this.db=db;}

    @GetMapping
    public Map<String,Object> list(@AuthenticationPrincipal UserPrincipal p){
        var items=db.sql("""
                select n.id,n.type,n.title,n.body,n.ticket_id as "ticketId",t.number as "ticketNumber",
                n.read_at as "readAt",n.created_at as "createdAt"
                from notifications n left join tickets t on t.id=n.ticket_id
                where n.user_id=:uid order by n.created_at desc limit 30
                """).param("uid",p.id()).query().listOfRows();
        long unread=db.sql("select count(*) from notifications where user_id=:uid and read_at is null")
                .param("uid",p.id()).query(Long.class).single();
        return Map.of("content",items,"unread",unread);
    }

    @PostMapping("/{id}/read") @Transactional
    public void read(@PathVariable UUID id,@AuthenticationPrincipal UserPrincipal p){
        db.sql("update notifications set read_at=CURRENT_TIMESTAMP where id=:id and user_id=:uid and read_at is null")
                .param("id",id).param("uid",p.id()).update();
    }

    @PostMapping("/read-all") @Transactional
    public void readAll(@AuthenticationPrincipal UserPrincipal p){
        db.sql("update notifications set read_at=CURRENT_TIMESTAMP where user_id=:uid and read_at is null")
                .param("uid",p.id()).update();
    }

    @DeleteMapping("/{id}") @Transactional
    public void delete(@PathVariable UUID id,@AuthenticationPrincipal UserPrincipal p){
        db.sql("delete from notifications where id=:id and user_id=:uid")
                .param("id",id).param("uid",p.id()).update();
    }
}
