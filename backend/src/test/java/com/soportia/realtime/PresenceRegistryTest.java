package com.soportia.realtime;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PresenceRegistryTest {
    @Test void userGoesOnlineOnFirstSessionAndOfflineOnLast() {
        PresenceRegistry registry = new PresenceRegistry();
        UUID agent = UUID.fromString("10000000-0000-0000-0000-000000000002");
        assertThat(registry.join(agent, "SUPPORT_AGENT", "s1")).isTrue();
        assertThat(registry.join(agent, "SUPPORT_AGENT", "s2")).isFalse();
        assertThat(registry.snapshot()).hasSize(1);
        assertThat(registry.leave("s1")).isFalse();
        assertThat(registry.leave("s2")).isTrue();
        assertThat(registry.snapshot()).isEmpty();
    }
}
