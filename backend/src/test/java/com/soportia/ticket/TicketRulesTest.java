package com.soportia.ticket;

import org.junit.jupiter.api.Test;

import static com.soportia.ticket.TicketRules.*;
import static org.assertj.core.api.Assertions.assertThat;

class TicketRulesTest {
    @Test void computesThreeByThreePriorityMatrix(){
        assertThat(priority(1,1)).isEqualTo(Priority.LOW);
        assertThat(priority(1,2)).isEqualTo(Priority.LOW);
        assertThat(priority(1,3)).isEqualTo(Priority.MEDIUM);
        assertThat(priority(2,1)).isEqualTo(Priority.LOW);
        assertThat(priority(2,2)).isEqualTo(Priority.MEDIUM);
        assertThat(priority(2,3)).isEqualTo(Priority.HIGH);
        assertThat(priority(3,1)).isEqualTo(Priority.MEDIUM);
        assertThat(priority(3,2)).isEqualTo(Priority.HIGH);
        assertThat(priority(3,3)).isEqualTo(Priority.CRITICAL);
    }
    @Test void enforcesStateMachine(){
        assertThat(canTransition(Status.OPEN,Status.IN_PROGRESS)).isTrue();
        assertThat(canTransition(Status.OPEN,Status.WAITING_FOR_REQUESTER)).isFalse();
        assertThat(canTransition(Status.RESOLVED,Status.IN_PROGRESS)).isTrue();
        assertThat(canTransition(Status.RESOLVED,Status.CLOSED)).isTrue();
        assertThat(canTransition(Status.CLOSED,Status.OPEN)).isFalse();
        assertThat(canTransition(Status.CANCELLED,Status.IN_PROGRESS)).isFalse();
    }
}
