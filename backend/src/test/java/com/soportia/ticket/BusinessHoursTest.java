package com.soportia.ticket;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessHoursTest {
    @Test void weekendWorkMovesToMonday() {
        OffsetDateTime sunday = OffsetDateTime.parse("2026-08-23T21:56:51Z");
        OffsetDateTime due = BusinessHours.addMinutes(sunday, 240);
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalDate()).hasToString("2026-08-24");
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalTime()).hasToString("12:00");
    }

    @Test void leftoverAfterCloseContinuesNextBusinessDay() {
        OffsetDateTime fridayAfternoon = OffsetDateTime.of(2026, 8, 21, 17, 0, 0, 0, ZoneOffset.ofHours(-5));
        OffsetDateTime due = BusinessHours.addMinutes(fridayAfternoon, 120);
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalDate()).hasToString("2026-08-24");
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalTime()).hasToString("09:00");
    }

    @Test void sameDayWhenItFits() {
        OffsetDateTime monday = OffsetDateTime.of(2026, 8, 24, 10, 0, 0, 0, ZoneOffset.ofHours(-5));
        OffsetDateTime due = BusinessHours.addMinutes(monday, 60);
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalDate()).hasToString("2026-08-24");
        assertThat(due.atZoneSameInstant(BusinessHours.ZONE).toLocalTime()).hasToString("11:00");
    }
}
