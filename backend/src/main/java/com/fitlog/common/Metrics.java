package com.fitlog.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

public final class Metrics {
    private Metrics() {}

    public static double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }

    public static Double estimated1RM(Double weight, Integer reps) {
        if (weight == null || reps == null || weight <= 0 || reps < 1 || reps > 12) return null;
        return round(weight * (1 + reps / 30.0), 1);
    }

    public static double setVolume(Map<String, Object> set) {
        if ("warmup".equals(Db.str(set, "set_type"))) return 0;
        Double weight = Db.dbl(set, "weight_kg");
        Long reps = Db.lng(set, "reps");
        if (weight == null || reps == null || reps == 0) return 0;
        return weight * reps;
    }

    public static double totalVolume(List<Map<String, Object>> sets) {
        double sum = 0;
        for (Map<String, Object> set : sets) sum += setVolume(set);
        return round(sum, 1);
    }

    /** 三个 PR 口径，与前端字段一致。 */
    public static M computePRs(List<Map<String, Object>> sets) {
        M maxWeight = null;
        M maxE1rm = null;
        M maxReps = null;
        for (Map<String, Object> set : sets) {
            if ("warmup".equals(Db.str(set, "set_type"))) continue;
            Double weight = Db.dbl(set, "weight_kg");
            Long repsL = Db.lng(set, "reps");
            Integer reps = repsL == 0 ? null : repsL.intValue();
            String date = Db.str(set, "local_date");
            if (weight != null && reps != null) {
                if (maxWeight == null || weight > Db.dbl(maxWeight, "weight", 0) ||
                        (weight.equals(Db.dbl(maxWeight, "weight")) && reps > Db.lng(maxWeight, "reps"))) {
                    maxWeight = M.of().put("weight", weight).put("reps", reps).put("date", date);
                }
            }
            Double e1rm = estimated1RM(weight, reps);
            if (e1rm != null && (maxE1rm == null || e1rm > Db.dbl(maxE1rm, "value", 0))) {
                maxE1rm = M.of().put("value", e1rm).put("weight", weight).put("reps", reps).put("date", date);
            }
            if (reps != null && reps > 0 && (maxReps == null || reps > Db.lng(maxReps, "reps"))) {
                maxReps = M.of().put("reps", reps).put("weight", weight == null ? 0 : weight).put("date", date);
            }
        }
        return M.of().put("maxWeight", maxWeight).put("maxE1RM", maxE1rm).put("maxReps", maxReps);
    }
}
