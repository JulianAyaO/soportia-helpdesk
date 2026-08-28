package com.soportia.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PresenceHub {
    private final PresenceRegistry registry = new PresenceRegistry();
    private final ConcurrentHashMap<String, WebSocketSession> sockets = new ConcurrentHashMap<>();
    private final ObjectMapper mapper;

    public PresenceHub(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public void join(WebSocketSession session, UUID userId, String role) {
        sockets.put(session.getId(), session);
        boolean first = registry.join(userId, role, session.getId());
        send(session, Map.of(
                "type", "hello",
                "online", registry.snapshot().stream().map(this::peerJson).toList()
        ));
        if (first) broadcast(session.getId(), presence(userId, role, true));
    }

    public UUID leave(WebSocketSession session) {
        sockets.remove(session.getId());
        UUID userId = registry.userOf(session.getId());
        String role = userId == null ? null : registry.role(userId);
        boolean last = registry.leave(session.getId());
        if (last && userId != null) {
            broadcast(null, presence(userId, role, false));
            return userId;
        }
        return null;
    }

    public void typing(WebSocketSession session, UUID threadId, boolean typing) {
        UUID sender = registry.userOf(session.getId());
        if (sender == null || threadId == null) return;
        String role = registry.role(sender);
        if (!"ADMIN".equals(role) && !sender.equals(threadId)) return;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "typing");
        payload.put("threadId", threadId.toString());
        payload.put("userId", sender.toString());
        payload.put("typing", typing);
        fanout(threadId, sender, payload);
    }

    public void notifyMessage(UUID threadId, UUID senderId) {
        if (threadId == null || senderId == null) return;
        fanout(threadId, senderId, Map.of(
                "type", "message",
                "threadId", threadId.toString(),
                "userId", senderId.toString()
        ));
    }

    private void fanout(UUID threadId, UUID senderId, Map<String, ?> payload) {
        for (PresenceRegistry.Peer peer : registry.snapshot()) {
            if (peer.userId().equals(senderId)) continue;
            boolean counterpart = peer.userId().equals(threadId);
            boolean admin = "ADMIN".equals(peer.role());
            if (counterpart || admin) deliver(peer.userId(), payload);
        }
    }

    public void sendTo(UUID userId, Map<String, ?> payload) {
        deliver(userId, payload);
    }

    public boolean online(UUID userId) {
        return registry.online(userId);
    }

    public String role(UUID userId) {
        return registry.role(userId);
    }

    public UUID userOf(WebSocketSession session) {
        return registry.userOf(session.getId());
    }

    private void deliver(UUID userId, Map<String, ?> payload) {
        sockets.forEach((id, session) -> {
            if (userId.equals(registry.userOf(id))) send(session, payload);
        });
    }

    private void broadcast(String exceptSession, Map<String, ?> payload) {
        sockets.forEach((id, session) -> {
            if (exceptSession != null && exceptSession.equals(id)) return;
            send(session, payload);
        });
    }

    public void pong(WebSocketSession session) {
        send(session, Map.of("type", "pong"));
    }

    private Map<String, Object> presence(UUID userId, String role, boolean online) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "presence");
        payload.put("userId", userId.toString());
        payload.put("role", role == null ? "" : role);
        payload.put("online", online);
        return payload;
    }

    private Map<String, String> peerJson(PresenceRegistry.Peer peer) {
        return Map.of("userId", peer.userId().toString(), "role", peer.role() == null ? "" : peer.role());
    }

    private void send(WebSocketSession session, Map<String, ?> payload) {
        if (session == null || !session.isOpen()) return;
        try {
            String json = mapper.writeValueAsString(payload);
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (Exception ignored) {
        }
    }
}
