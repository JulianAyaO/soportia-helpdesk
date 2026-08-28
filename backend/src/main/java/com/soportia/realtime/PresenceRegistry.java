package com.soportia.realtime;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PresenceRegistry {
    public record Peer(UUID userId, String role) {}

    private final ConcurrentHashMap<UUID, ConcurrentHashMap.KeySetView<String, Boolean>> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, String> roles = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, UUID> sessionUser = new ConcurrentHashMap<>();

    public boolean join(UUID userId, String role, String sessionId) {
        roles.put(userId, role);
        sessionUser.put(sessionId, userId);
        var ids = sessions.computeIfAbsent(userId, key -> ConcurrentHashMap.newKeySet());
        boolean first = ids.isEmpty();
        ids.add(sessionId);
        return first;
    }

    public boolean leave(String sessionId) {
        UUID userId = sessionUser.remove(sessionId);
        if (userId == null) return false;
        var ids = sessions.get(userId);
        if (ids == null) return false;
        ids.remove(sessionId);
        if (!ids.isEmpty()) return false;
        sessions.compute(userId, (key, current) -> current == null || current.isEmpty() ? null : current);
        if (sessions.containsKey(userId)) return false;
        roles.remove(userId);
        return true;
    }

    public UUID userOf(String sessionId) {
        return sessionUser.get(sessionId);
    }

    public String role(UUID userId) {
        return roles.get(userId);
    }

    public boolean online(UUID userId) {
        var ids = sessions.get(userId);
        return ids != null && !ids.isEmpty();
    }

    public List<Peer> snapshot() {
        return sessions.keySet().stream()
                .map(id -> new Peer(id, roles.getOrDefault(id, "")))
                .toList();
    }

    public List<UUID> sessionUsers(java.util.function.Predicate<Peer> match) {
        return snapshot().stream().filter(match).map(Peer::userId).toList();
    }
}
