package com.soportia.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.UUID;

@Component
public class RealtimeHandler extends TextWebSocketHandler {
    private final PresenceHub hub;
    private final CallHub calls;
    private final ObjectMapper mapper;

    public RealtimeHandler(PresenceHub hub, CallHub calls, ObjectMapper mapper) {
        this.hub = hub;
        this.calls = calls;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID userId = (UUID) session.getAttributes().get("userId");
        String role = String.valueOf(session.getAttributes().get("role"));
        if (userId == null) {
            try { session.close(CloseStatus.NOT_ACCEPTABLE); } catch (Exception ignored) {}
            return;
        }
        hub.join(session, userId, role);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode node = mapper.readTree(message.getPayload());
        String type = node.path("type").asText();
        if ("ping".equals(type)) {
            hub.pong(session);
            return;
        }
        if ("typing".equals(type)) {
            String thread = node.path("threadId").asText(null);
            if (thread == null || thread.isBlank()) return;
            try {
                hub.typing(session, UUID.fromString(thread), node.path("typing").asBoolean(false));
            } catch (IllegalArgumentException ignored) {
            }
            return;
        }
        if ("call".equals(type)) calls.handle(session, node);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID gone = hub.leave(session);
        if (gone != null) calls.drop(gone);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        UUID gone = hub.leave(session);
        if (gone != null) calls.drop(gone);
        try { session.close(CloseStatus.SERVER_ERROR); } catch (Exception ignored) {}
    }
}
