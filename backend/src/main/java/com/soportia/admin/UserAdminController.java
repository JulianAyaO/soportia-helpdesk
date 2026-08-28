package com.soportia.admin;

import com.soportia.common.EventRecorder;
import com.soportia.config.SecurityConfig.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserAdminController {
    private static final Set<String> CREATABLE=Set.of("EMPLOYEE","SUPPORT_AGENT");
    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final EventRecorder events;
    public UserAdminController(JdbcClient db,PasswordEncoder passwords,EventRecorder events){
        this.db=db;this.passwords=passwords;this.events=events;
    }

    @GetMapping
    public List<Map<String,Object>> list(){
        return db.sql("""
                select u.id,u.email,u.display_name as "displayName",u.role,u.active,
                u.created_at as "createdAt",
                (select t.name from teams t join team_members m on m.team_id=t.id
                 where m.user_id=u.id order by t.name limit 1) as "teamName",
                (select c.name from categories c join team_members m on m.team_id=c.default_team_id
                 where m.user_id=u.id and c.active=true order by c.name limit 1) as "categoryName",
                (select c.id from categories c join team_members m on m.team_id=c.default_team_id
                 where m.user_id=u.id and c.active=true order by c.name limit 1) as "categoryId"
                from users u order by u.display_name
                """).query().listOfRows();
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    public Map<String,Object> create(@Valid @RequestBody CreateUser r,@AuthenticationPrincipal UserPrincipal p){
        String role=r.role()==null?"":r.role().trim().toUpperCase();
        if(!CREATABLE.contains(role)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Solo se pueden crear empleados o agentes");
        if(role.equals("SUPPORT_AGENT")&&r.categoryId()==null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Elige la categoría en la que trabajará el agente");
        boolean taken=db.sql("select count(*) from users where lower(email)=lower(:email)")
                .param("email",r.email().trim()).query(Long.class).single()>0;
        if(taken) throw new ResponseStatusException(HttpStatus.CONFLICT,"Ese correo ya está registrado");
        UUID teamId=null;
        if(r.categoryId()!=null){
            teamId=db.sql("select default_team_id from categories where id=:id and active=true")
                    .param("id",r.categoryId()).query(UUID.class).list().stream().findFirst()
                    .orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Categoría no encontrada"));
        }
        UUID id=UUID.randomUUID();
        db.sql("insert into users(id,email,password_hash,display_name,role,active) values(:id,:email,:hash,:name,:role,true)")
                .param("id",id).param("email",r.email().trim().toLowerCase())
                .param("hash",passwords.encode(r.password())).param("name",r.displayName().trim())
                .param("role",role).update();
        if(teamId!=null){
            db.sql("insert into team_members(team_id,user_id) values(:t,:u)").param("t",teamId).param("u",id).update();
        }
        events.audit(p.id(),"USER_CREATED","USER",id,Map.of("email",r.email().trim().toLowerCase(),"role",role));
        return Map.of("id",id,"email",r.email().trim().toLowerCase(),"displayName",r.displayName().trim(),"role",role);
    }

    @PatchMapping("/{id}") @Transactional
    public void update(@PathVariable UUID id,@RequestBody UpdateUser r,@AuthenticationPrincipal UserPrincipal p){
        if(id.equals(p.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"No puedes desactivar tu propia cuenta");
        Map<String,Object> user=db.sql("select role,active from users where id=:id").param("id",id).query().listOfRows()
                .stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Usuario no encontrado"));
        if(r.active()!=null){
            if(!r.active()&&"ADMIN".equals(user.get("role"))){
                long admins=db.sql("select count(*) from users where role='ADMIN' and active=true").query(Long.class).single();
                if(admins<=1) throw new ResponseStatusException(HttpStatus.CONFLICT,"Debe quedar al menos un administrador");
            }
            db.sql("update users set active=:active where id=:id").param("active",r.active()).param("id",id).update();
            events.audit(p.id(),r.active()?"USER_ACTIVATED":"USER_DEACTIVATED","USER",id,Map.of());
        }
        if("ADMIN".equals(user.get("role"))){
            db.sql("delete from team_members where user_id=:id").param("id",id).update();
        } else if(r.categoryId()!=null){
            UUID teamId=db.sql("select default_team_id from categories where id=:id and active=true")
                    .param("id",r.categoryId()).query(UUID.class).list().stream().findFirst()
                    .orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Categoría no encontrada"));
            db.sql("delete from team_members where user_id=:id").param("id",id).update();
            db.sql("insert into team_members(team_id,user_id) values(:t,:u)").param("t",teamId).param("u",id).update();
            events.audit(p.id(),"USER_TEAM_CHANGED","USER",id,Map.of("categoryId",r.categoryId()));
        }
    }

    public record CreateUser(@NotBlank @Email String email,@NotBlank @Size(max=120) String displayName,
                             @NotBlank @Size(min=8,max=80) String password,@NotBlank String role, UUID categoryId){}
    public record UpdateUser(Boolean active, UUID categoryId){}
}
