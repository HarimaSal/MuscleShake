package com.fitlog.media;

import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.Settings;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class BudgetService {
    private static final double STORAGE_CNY_PER_GB = 0.12;
    private static final double TRAFFIC_CNY_PER_GB = 0.2;
    private static final double TRANSCODE_CNY_PER_MIN = 0.04;

    private final Db db;
    private final Settings settings;
    private final AppProps props;

    public BudgetService(Db db, Settings settings, AppProps props) {
        this.db = db;
        this.settings = settings;
        this.props = props;
    }

    private String currentMonth() {
        String month = TimeUtil.monthOf(TimeUtil.todayForString(-480));
        String saved = settings.get("budget_month", month);
        if (!month.equals(saved)) {
            settings.set("budget_month", month);
            settings.set("transcode_seconds_" + month, "0");
        }
        return month;
    }

    public void recordTranscode(double seconds) {
        String month = currentMonth();
        String key = "transcode_seconds_" + month;
        double total = settings.doubleValue(key, 0) + Math.max(0, seconds);
        settings.set(key, String.valueOf(Math.round(total)));
    }

    public Map<String, Object> status() {
        String month = currentMonth();
        double cap = settings.doubleValue("budget_cap_cny", props.getBudgetCapCny());
        long storageBytes = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE deleted_at IS NULL");
        double storageGb = storageBytes / Math.pow(1024, 3);
        double transcodeSeconds = settings.doubleValue("transcode_seconds_" + month, 0);
        double transcodeMinutes = transcodeSeconds / 60;
        long views = db.count("SELECT COUNT(*) AS n FROM post_views WHERE view_date LIKE ?", month + "-%");
        double trafficGb = (views * 2.0) / 1024;
        double storageCost = storageGb * STORAGE_CNY_PER_GB;
        double trafficCost = trafficGb * TRAFFIC_CNY_PER_GB;
        double transcodeCost = transcodeMinutes * TRANSCODE_CNY_PER_MIN;
        double spent = Metrics.round(storageCost + trafficCost + transcodeCost, 2);
        double ratio = cap > 0 ? spent / cap : 0;
        String level = ratio >= 1 ? "blocked" : ratio >= 0.8 ? "warn80" : ratio >= 0.5 ? "warn50" : "normal";
        String message = "blocked".equals(level)
                ? "内测期存储额度已满，视频上传暂停，图片不受影响"
                : "warn80".equals(level) ? "内测期存储额度接近上限，新用户视频上传已暂停" : "";
        return M.of()
                .put("month", month)
                .put("capCny", cap)
                .put("spentCny", spent)
                .put("ratio", Metrics.round(ratio * 100, 1))
                .put("level", level)
                .put("breakdown", M.of()
                        .put("storageGb", Metrics.round(storageGb, 3)).put("storageCny", Metrics.round(storageCost, 2))
                        .put("trafficGb", Metrics.round(trafficGb, 3)).put("trafficCny", Metrics.round(trafficCost, 2))
                        .put("transcodeMinutes", Metrics.round(transcodeMinutes, 1)).put("transcodeCny", Metrics.round(transcodeCost, 2)))
                .put("videoUploadAllowed", !"blocked".equals(level))
                .put("message", message)
                .map();
    }

    /** 返回 null 表示允许，否则为拒绝原因。 */
    public String videoGate(String createdAt) {
        Map<String, Object> status = status();
        String level = String.valueOf(status.get("level"));
        if ("blocked".equals(level)) return "内测期存储额度已满，视频上传暂停，图片不受影响";
        if ("warn80".equals(level)) {
            try {
                boolean isNew = Instant.parse(createdAt).isAfter(Instant.now().minusSeconds(7 * 86400));
                if (isNew) return "内测期存储额度接近上限，新用户视频上传暂停，图片不受影响";
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    public List<Map<String, Object>> costSeries(int days) {
        String today = TimeUtil.todayForString(-480);
        List<Map<String, Object>> views = db.all("SELECT view_date, COUNT(*) AS n FROM post_views WHERE view_date <= ? GROUP BY view_date", today);
        long storageBytes = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE deleted_at IS NULL");
        double storageGb = storageBytes / Math.pow(1024, 3);
        List<Map<String, Object>> out = new ArrayList<>();
        LocalDate cursor = LocalDate.parse(today).minusDays(days - 1L);
        for (int i = 0; i < days; i++) {
            String day = cursor.plusDays(i).toString();
            long count = 0;
            for (Map<String, Object> row : views) if (day.equals(Db.str(row, "view_date"))) count = Db.lng(row, "n");
            double cost = Metrics.round(storageGb * STORAGE_CNY_PER_GB + ((count * 2.0) / 1024) * TRAFFIC_CNY_PER_GB, 3);
            out.add(M.of().put("date", day).put("costCny", cost).map());
        }
        return out;
    }
}
