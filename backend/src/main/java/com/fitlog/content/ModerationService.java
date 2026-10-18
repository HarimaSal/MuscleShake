package com.fitlog.content;

import com.fitlog.common.Db;
import com.fitlog.common.M;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ModerationService {
    public record Hit(String ruleCode, String category, String word, int position) {}

    public record Result(boolean passed, List<Hit> hits, boolean highRisk, long latencyMs) {}

    private static final List<Map<String, Object>> RULES = List.of(
            Map.of("code", "AD-01", "category", "广告导流", "words", List.of("加微信", "加vx", "加VX", "vx：", "微信号：", "扫码进群", "代购", "私我", "代理加盟", "返利")),
            Map.of("code", "MED-01", "category", "医疗功效承诺", "words", List.of("包治", "治愈", "根治", "药到病除", "保证减肥", "保证增肌", "减肥特效", "一针见效", "替代药物")),
            Map.of("code", "ABS-01", "category", "绝对化用语", "words", List.of("全网第一", "最强健身", "唯一有效", "百分百有效", "永不反弹", "绝对安全")),
            Map.of("code", "ABU-01", "category", "辱骂", "words", List.of("傻逼", "智障", "滚蛋", "去死"))
    );

    private final Db db;

    public ModerationService(Db db) {
        this.db = db;
    }

    @SuppressWarnings("unchecked")
    public Result review(String text) {
        long started = System.currentTimeMillis();
        Set<String> enabled = db.all("SELECT code FROM review_rules WHERE active = 1").stream()
                .map(r -> Db.str(r, "code")).collect(Collectors.toSet());
        long totalRules = db.count("SELECT COUNT(*) AS n FROM review_rules");
        List<Hit> hits = new ArrayList<>();
        for (Map<String, Object> rule : RULES) {
            String code = String.valueOf(rule.get("code"));
            if (totalRules > 0 && !enabled.contains(code)) continue;
            for (String word : (List<String>) rule.get("words")) {
                int from = 0;
                while (true) {
                    int index = text.indexOf(word, from);
                    if (index < 0) break;
                    hits.add(new Hit(code, String.valueOf(rule.get("category")), word, index));
                    from = index + word.length();
                }
            }
        }
        boolean highRisk = hits.stream().anyMatch(h -> h.ruleCode().startsWith("MED") || h.ruleCode().startsWith("ABU"));
        return new Result(hits.isEmpty(), hits, highRisk, System.currentTimeMillis() - started);
    }

    public List<Map<String, Object>> hitDetails(String text, Result result) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Hit hit : result.hits()) {
            int start = Math.max(0, hit.position() - 12);
            int end = Math.min(text.length(), hit.position() + hit.word().length() + 12);
            String snippet = (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length() ? "…" : "");
            list.add(M.of().put("ruleCode", hit.ruleCode()).put("category", hit.category()).put("word", hit.word())
                    .put("position", hit.position()).put("snippet", snippet).map());
        }
        return list;
    }
}
