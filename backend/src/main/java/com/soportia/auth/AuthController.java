package com.soportia.auth;

import com.soportia.config.SecurityConfig.UserPrincipal;
import com.soportia.common.EventRecorder;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final EventRecorder events;
    private final LoginAttemptService loginAttempts;
    private final int refreshDays;

    public AuthController(JdbcClient db, PasswordEncoder passwords, JwtService jwt, EventRecorder events,
                          LoginAttemptService loginAttempts,
                          @Value("${soportia.jwt.refresh-days}") int refreshDays) {
        this.db=db; this.passwords=passwords; this.jwt=jwt; this.events=events;
        this.loginAttempts=loginAttempts; this.refreshDays=refreshDays;
    }

    @PostMapping("/login")
    public Map<String,Object> login(@Valid @RequestBody LoginRequest req, HttpServletRequest request,
                                    HttpServletResponse response) {
        String remoteAddress=request.getRemoteAddr();
        loginAttempts.check(req.email(),remoteAddress);
        UserRow user = db.sql("select id,email,password_hash,display_name,role from users where lower(email)=lower(:email) and active=true")
                .param("email", req.email()).query(UserRow.class).optional().orElse(null);
        if (user==null||!passwords.matches(req.password(), user.passwordHash())) {
            loginAttempts.failed(req.email(),remoteAddress);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        loginAttempts.succeeded(req.email(),remoteAddress);
        issueRefresh(user.id(), response);
        events.audit(user.id(),"LOGIN","USER",user.id(),Map.of("result","SUCCESS"));
        return tokenResponse(user);
    }

    @PostMapping("/refresh")
    public Map<String,Object> refresh(HttpServletRequest request, HttpServletResponse response) {
        String raw = cookie(request, "refresh_token");
        if (raw == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token missing");
        UserRow user = db.sql("""
                select u.id,u.email,u.password_hash,u.display_name,u.role from refresh_tokens r
                join users u on u.id=r.user_id where r.token_hash=:hash and r.revoked_at is null
                and r.expires_at > CURRENT_TIMESTAMP and u.active=true
                """)
                .param("hash", hash(raw)).query(UserRow.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));
        db.sql("update refresh_tokens set revoked_at=CURRENT_TIMESTAMP where token_hash=:hash").param("hash",hash(raw)).update();
        issueRefresh(user.id(), response);
        return tokenResponse(user);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response,
                       @AuthenticationPrincipal UserPrincipal p) {
        String raw=cookie(request,"refresh_token");
        if(raw!=null) db.sql("update refresh_tokens set revoked_at=CURRENT_TIMESTAMP where token_hash=:h").param("h",hash(raw)).update();
        Cookie c=new Cookie("refresh_token",""); c.setHttpOnly(true); c.setSecure(false); c.setPath("/api/v1/auth"); c.setMaxAge(0);
        response.addCookie(c);
        if(p!=null) events.audit(p.id(),"LOGOUT","USER",p.id(),Map.of("result","SUCCESS"));
    }

    @GetMapping("/me")
    public Map<String,Object> me(@AuthenticationPrincipal UserPrincipal p) {
        UserRow user=db.sql("select id,email,password_hash,display_name,role from users where id=:id")
                .param("id",p.id()).query(UserRow.class).single();
        return userView(user);
    }

    private void issueRefresh(UUID userId, HttpServletResponse response) {
        String raw=UUID.randomUUID()+"."+UUID.randomUUID();
        db.sql("insert into refresh_tokens(id,user_id,token_hash,expires_at) values(:id,:uid,:h,:exp)")
                .param("id",UUID.randomUUID()).param("uid",userId).param("h",hash(raw))
                .param("exp", OffsetDateTime.now(ZoneOffset.UTC).plus(refreshDays,ChronoUnit.DAYS)).update();
        Cookie c=new Cookie("refresh_token",raw); c.setHttpOnly(true); c.setSecure(false);
        c.setPath("/api/v1/auth"); c.setMaxAge(refreshDays*86400); c.setAttribute("SameSite","Lax"); response.addCookie(c);
    }
    private Map<String,Object> tokenResponse(UserRow u) {
        return Map.of("accessToken",jwt.create(u.id(),u.email(),u.role()),"tokenType","Bearer",
                "expiresIn",jwt.expiresInSeconds(),
                "user",userView(u));
    }
    private Map<String,Object> userView(UserRow u) {
        List<Map<String,Object>> teams=db.sql("""
                select t.id,t.name,t.description
                from teams t join team_members m on m.team_id=t.id
                where m.user_id=:id order by t.name
                """).param("id",u.id()).query().listOfRows();
        for(Map<String,Object> team:teams){
            team.put("categories",db.sql("select name from categories where default_team_id=:id and active=true order by name")
                    .param("id",team.get("id")).query(String.class).list());
        }
        Map<String,Object> user=new LinkedHashMap<>();
        user.put("id",u.id());
        user.put("email",u.email());
        user.put("displayName",u.displayName());
        user.put("role",u.role());
        user.put("teams",teams);
        return user;
    }
    private static String cookie(HttpServletRequest r,String name) {
        if(r.getCookies()!=null) for(Cookie c:r.getCookies()) if(name.equals(c.getName())) return c.getValue(); return null;
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e){ throw new IllegalStateException(e); }
    }
    public record LoginRequest(@NotBlank @Email String email,@NotBlank String password){}
    public record UserRow(UUID id,String email,String passwordHash,String displayName,String role){}
}
