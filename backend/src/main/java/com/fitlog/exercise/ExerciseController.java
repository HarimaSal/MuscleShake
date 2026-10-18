package com.fitlog.exercise;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.AuditService;
import com.fitlog.common.M;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/exercises")
public class ExerciseController {
    private final ExerciseService service;
    private final AuditService audit;

    public ExerciseController(ExerciseService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String q,
                                    @RequestParam(required = false) String muscle,
                                    @RequestParam(required = false) String equipment,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String favorite,
                                    HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        boolean onlyFavorite = "1".equals(favorite) || "true".equals(favorite);
        return Api.ok(M.of()
                .put("items", service.list(user.id(), q, muscle, equipment, type, onlyFavorite))
                .put("meta", M.of().put("muscles", ExerciseService.MUSCLES).put("equipments", ExerciseService.EQUIPMENTS).put("types", ExerciseService.TYPES))
                .map());
    }

    @GetMapping("/recent")
    public Map<String, Object> recent(HttpServletRequest request) {
        return Api.ok(Map.of("items", service.recent(Auth.current(request).id())));
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return Api.ok(service.create(Auth.current(request).id(), body));
    }

    @PostMapping("/merge")
    public Map<String, Object> merge(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String sourceId = body.get("sourceId") == null ? "" : String.valueOf(body.get("sourceId"));
        String targetId = body.get("targetId") == null ? "" : String.valueOf(body.get("targetId"));
        return Api.ok(service.merge(Auth.current(request).id(), sourceId, targetId));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.get(Auth.current(request).id(), id));
    }

    @PostMapping("/{id}/favorite")
    public Map<String, Object> favorite(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> result = service.toggleFavorite(user.id(), id);
        audit.track(user.id(), "exercise_favorite", Map.of("exerciseId", id, "favorite", result.get("favorite")));
        return Api.ok(result);
    }
}
