package com.soportia.ticket;

import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

public final class BusinessHours {
    public static final ZoneId ZONE = ZoneId.of("America/Bogota");
    public static final LocalTime START = LocalTime.of(8, 0);
    public static final LocalTime END = LocalTime.of(18, 0);

    private BusinessHours() {}

    public static OffsetDateTime addMinutes(OffsetDateTime start, long minutes) {
        if (minutes <= 0) return start;
        ZonedDateTime cursor = alignToOpen(toZone(start));
        long remaining = minutes;
        while (remaining > 0) {
            cursor = alignToOpen(cursor);
            ZonedDateTime close = cursor.toLocalDate().atTime(END).atZone(ZONE);
            long available = Math.max(0, Duration.between(cursor, close).toMinutes());
            if (available == 0) {
                cursor = nextOpenDay(cursor);
                continue;
            }
            long used = Math.min(remaining, available);
            cursor = cursor.plusMinutes(used);
            remaining -= used;
            if (remaining > 0) cursor = nextOpenDay(cursor);
        }
        return cursor.toOffsetDateTime();
    }

    public static OffsetDateTime toOffset(Object value) {
        if (value instanceof OffsetDateTime offset) return offset;
        if (value instanceof Instant instant) return instant.atOffset(ZoneOffset.UTC);
        if (value instanceof Timestamp timestamp) return timestamp.toInstant().atOffset(ZoneOffset.UTC);
        if (value instanceof java.util.Date date) return date.toInstant().atOffset(ZoneOffset.UTC);
        return OffsetDateTime.parse(String.valueOf(value));
    }

    private static ZonedDateTime toZone(OffsetDateTime start) {
        return start.atZoneSameInstant(ZONE);
    }

    private static ZonedDateTime alignToOpen(ZonedDateTime time) {
        ZonedDateTime local = time.withZoneSameInstant(ZONE);
        if (isClosedDay(local) || !local.toLocalTime().isBefore(END)) return nextOpenDay(local);
        if (local.toLocalTime().isBefore(START)) return local.toLocalDate().atTime(START).atZone(ZONE);
        return local;
    }

    private static ZonedDateTime nextOpenDay(ZonedDateTime time) {
        ZonedDateTime next = time.toLocalDate().plusDays(1).atTime(START).atZone(ZONE);
        while (isClosedDay(next)) next = next.plusDays(1);
        return next;
    }

    private static boolean isClosedDay(ZonedDateTime time) {
        DayOfWeek day = time.getDayOfWeek();
        return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY;
    }
}
