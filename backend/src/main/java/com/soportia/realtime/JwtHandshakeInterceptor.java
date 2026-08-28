package com.soportia.realtime;

import com.soportia.auth.JwtService;
import io.jsonwebtoken.Claims;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.UUID;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {
    private final JwtService jwt;

    public JwtHandshakeInterceptor(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = token(request);
        if (token == null || token.isBlank()) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        try {
            Claims claims = jwt.parse(token);
            attributes.put("userId", UUID.fromString(claims.getSubject()));
            attributes.put("role", claims.get("role", String.class));
            return true;
        } catch (Exception ex) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }

    private String token(ServerHttpRequest request) {
        String header = request.getHeaders().getFirst("Authorization");
        if (header != null && header.startsWith("Bearer ")) return header.substring(7);
        return UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("access_token");
    }
}
