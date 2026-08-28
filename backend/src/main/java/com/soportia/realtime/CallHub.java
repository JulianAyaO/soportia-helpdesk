package com.soportia.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class CallHub {
    private record Call(UUID id, UUID caller, UUID callee) {}

    private final PresenceHub presence;
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<UUID, Call> calls = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, UUID> byUser = new ConcurrentHashMap<>();

    public CallHub(PresenceHub presence, ObjectMapper mapper) {
        this.presence = presence;
        this.mapper = mapper;
    }

    public synchronized void handle(WebSocketSession session, JsonNode node) {
        UUID sender = presence.userOf(session);
        if (sender == null) return;
        String action = node.path("action").asText("");
        switch (action) {
            case "invite" -> invite(sender, node);
            case "accept" -> accept(sender, id(node));
            case "reject" -> reject(sender, id(node));
            case "hangup" -> hangup(sender, id(node));
            case "signal" -> signal(sender, id(node), node.get("payload"));
            default -> { }
        }
    }

    public synchronized void drop(UUID userId) {
        UUID callId = byUser.get(userId);
        if (callId == null) return;
        Call call = calls.get(callId);
        if (call == null) return;
        UUID other = other(call, userId);
        clear(call);
        if (other != null) presence.sendTo(other, frame(call.id(), "hangup", userId, other, null, null));
    }

    private void invite(UUID sender, JsonNode node) {
        String role = presence.role(sender);
        if (!"ADMIN".equals(role) && !"SUPPORT_AGENT".equals(role)) return;
        UUID to = uuid(node.path("to").asText(null));
        UUID callId = uuid(node.path("callId").asText(null));
        if (to == null || callId == null || sender.equals(to)) return;
        if (!presence.online(to)) {
            presence.sendTo(sender, frame(callId, "unavailable", sender, to, null, null));
            return;
        }
        if (byUser.containsKey(sender) || byUser.containsKey(to)) {
            presence.sendTo(sender, frame(callId, "busy", sender, to, null, null));
            return;
        }
        Call call = new Call(callId, sender, to);
        calls.put(callId, call);
        byUser.put(sender, callId);
        byUser.put(to, callId);
        Map<String, Object> payload = frame(callId, "invite", sender, to, node.path("fromName").asText(""), null);
        payload.put("fromRole", role == null ? "" : role);
        presence.sendTo(to, payload);
    }

    private void accept(UUID sender, UUID callId) {
        Call call = calls.get(callId);
        if (call == null || !sender.equals(call.callee())) return;
        presence.sendTo(call.caller(), frame(callId, "accept", sender, call.caller(), null, null));
    }

    private void reject(UUID sender, UUID callId) {
        Call call = calls.get(callId);
        if (call == null || !sender.equals(call.callee())) return;
        UUID caller = call.caller();
        clear(call);
        presence.sendTo(caller, frame(callId, "reject", sender, caller, null, null));
    }

    private void hangup(UUID sender, UUID callId) {
        Call call = calls.get(callId);
        if (call == null || !member(call, sender)) return;
        UUID other = other(call, sender);
        clear(call);
        if (other != null) presence.sendTo(other, frame(callId, "hangup", sender, other, null, null));
    }

    private void signal(UUID sender, UUID callId, JsonNode payload) {
        Call call = calls.get(callId);
        if (call == null || !member(call, sender) || payload == null || payload.isNull()) return;
        UUID other = other(call, sender);
        if (other == null) return;
        presence.sendTo(other, frame(callId, "signal", sender, other, null, payload));
    }

    private void clear(Call call) {
        calls.remove(call.id());
        byUser.remove(call.caller());
        byUser.remove(call.callee());
    }

    private boolean member(Call call, UUID user) {
        return call.caller().equals(user) || call.callee().equals(user);
    }

    private UUID other(Call call, UUID user) {
        return call.caller().equals(user) ? call.callee() : call.caller();
    }

    private Map<String, Object> frame(UUID callId, String action, UUID from, UUID to, String fromName, JsonNode payload) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", "call");
        out.put("action", action);
        out.put("callId", callId.toString());
        if (from != null) out.put("from", from.toString());
        if (to != null) out.put("to", to.toString());
        if (fromName != null && !fromName.isBlank()) out.put("fromName", fromName);
        if (payload != null && !payload.isNull()) out.put("payload", mapper.convertValue(payload, Object.class));
        return out;
    }

    private UUID id(JsonNode node) {
        return node == null ? null : uuid(node.path("callId").asText(null));
    }

    private UUID uuid(String value) {
        if (value == null || value.isBlank()) return null;
        try { return UUID.fromString(value); }
        catch (IllegalArgumentException ex) { return null; }
    }
}
