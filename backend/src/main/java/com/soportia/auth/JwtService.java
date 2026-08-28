package com.soportia.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {
    private final SecretKey key;
    private final long accessMinutes;

    public JwtService(@Value("${soportia.jwt.secret}") String secret,
                      @Value("${soportia.jwt.access-minutes}") long accessMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessMinutes = accessMinutes;
    }

    public String create(UUID id, String email, String role) {
        Instant now = Instant.now();
        return Jwts.builder().subject(id.toString()).claim("email", email).claim("role", role)
                .issuedAt(Date.from(now)).expiration(Date.from(now.plus(accessMinutes, ChronoUnit.MINUTES)))
                .signWith(key).compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public long expiresInSeconds() {
        return accessMinutes * 60;
    }
}
