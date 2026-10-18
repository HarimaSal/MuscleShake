package com.fitlog.common;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.List;

public final class TimeUtil {
    public static final DateTimeFormatter ISO_MS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private TimeUtil() {}

    public static String now() {
        return ISO_MS.format(Instant.now());
    }

    public static String normalizeIso(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return ISO_MS.format(Instant.parse(value.trim()));
        } catch (Exception ignored) {
            try {
                return ISO_MS.format(OffsetDateTime.parse(value.trim()).toInstant());
            } catch (Exception e) {
                throw ApiException.badRequest("时间格式不正确");
            }
        }
    }

    /** 与 JS getTimezoneOffset() 一致：东八区为 -480。 */
    public static LocalDate todayFor(int tzOffset) {
        return LocalDate.now(ZoneOffset.ofTotalSeconds(-tzOffset * 60));
    }

    public static String todayForString(int tzOffset) {
        return todayFor(tzOffset).toString();
    }

    public static String localDateOf(String iso, int tzOffset) {
        Instant instant;
        try {
            instant = Instant.parse(normalizeIso(iso));
        } catch (Exception e) {
            throw ApiException.badRequest("开始时间格式不正确");
        }
        return instant.atOffset(ZoneOffset.ofTotalSeconds(-tzOffset * 60)).toLocalDate().toString();
    }

    public static String addDays(String date, int days) {
        return LocalDate.parse(date).plusDays(days).toString();
    }

    public static long diffDays(String a, String b) {
        return LocalDate.parse(a).toEpochDay() - LocalDate.parse(b).toEpochDay();
    }

    public static String startOfWeek(String date) {
        LocalDate d = LocalDate.parse(date);
        return d.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();
    }

    public static List<String> monthDays(String month) {
        LocalDate first = LocalDate.parse(month + "-01");
        List<String> days = new ArrayList<>();
        LocalDate cursor = first;
        while (cursor.getMonthValue() == first.getMonthValue()) {
            days.add(cursor.toString());
            cursor = cursor.plusDays(1);
        }
        return days;
    }

    public static String monthOf(String date) {
        return date.substring(0, 7);
    }

    public static String isoWeekKey(String date) {
        LocalDate d = LocalDate.parse(date);
        WeekFields wf = WeekFields.ISO;
        return d.get(wf.weekBasedYear()) + "-W" + String.format("%02d", d.get(wf.weekOfWeekBasedYear()));
    }

    public static boolean validDate(String value) {
        try {
            LocalDate.parse(value);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
