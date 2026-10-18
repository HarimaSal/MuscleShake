package com.fitlog.workout;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.checkin.BadgeService;
import com.fitlog.checkin.CheckinService;
import com.fitlog.common.Api;
import com.fitlog.common.AuditService;
import com.fitlog.common.M;
import com.fitlog.exercise.ExerciseService;
import com.fitlog.media.MediaService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {
    private final SessionService service;
    private final CheckinService checkins;
    private final BadgeService badges;
    private final MediaService media;
    private final AuditService audit;
    private final ExerciseService exercises;

    public SessionController(SessionService service, CheckinService checkins, BadgeService badges,
                             MediaService media, AuditService audit, ExerciseService exercises) {
        this.service = service;
        this.checkins = checkins;
        this.badges = badges;
        this.media = media;
        this.audit = audit;
        this.exercises = exercises;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int pageSize,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String month,
                                    @RequestParam(required = false) String q,
                                    HttpServletRequest request) {
        return Api.ok(service.list(Auth.current(request).id(), page, pageSize, type, month, q));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> result = service.create(user.id(), body);
        boolean duplicated = Boolean.TRUE.equals(result.get("duplicated"));
        if (!duplicated) {
            audit.track(user.id(), "session_start", Map.of("entry", body.get("source") == null ? "tab" : body.get("source")));
        }
        List<Map<String, Object>> newBadges = badges.evaluate(user.id(), checkins.streak(user.id(), user.tzOffset()),
                result.get("prs") instanceof List<?> list && !list.isEmpty());
        @SuppressWarnings("unchecked")
        Map<String, Object> session = (Map<String, Object>) result.get("session");
        audit.track(user.id(), "session_saved", Map.of("duration", session.get("durationSec"), "items", session.get("itemCount"),
                "sets", session.get("setCount"), "volume", session.get("volumeKg"), "has_media", ((Number) session.get("mediaCount")).longValue() > 0,
                "source", body.get("source") == null ? "manual" : body.get("source")));
        result.put("newBadges", newBadges);
        result.put("checkin", checkins.streak(user.id(), user.tzOffset()));
        return ResponseEntity.status(duplicated ? HttpStatus.OK : HttpStatus.CREATED).body(Api.ok(result));
    }

    @PostMapping("/quick")
    public ResponseEntity<Map<String, Object>> quick(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> result = service.quick(user.id(), user.tzOffset(), body);
        result.put("newBadges", badges.evaluate(user.id(), checkins.streak(user.id(), user.tzOffset()), false));
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(result));
    }

    @GetMapping("/trash")
    public Map<String, Object> trash(HttpServletRequest request) {
        return Api.ok(Map.of("items", service.trash(Auth.current(request).id())));
    }

    @GetMapping("/prefill")
    public Map<String, Object> prefill(@RequestParam String exerciseId, @RequestParam(required = false) String sessionId,
                                       HttpServletRequest request) {
        return Api.ok(Map.of("last", exercises.prefill(Auth.current(request).id(), exerciseId, sessionId)));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.detail(Auth.current(request).id(), id, false));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        return Api.ok(service.update(Auth.current(request).id(), id, body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.delete(Auth.current(request).id(), id));
    }

    @PostMapping("/{id}/restore")
    public Map<String, Object> restore(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.restore(Auth.current(request).id(), id));
    }

    @DeleteMapping("/{id}/purge")
    public Map<String, Object> purge(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.purge(Auth.current(request).id(), id));
    }

    @PostMapping("/{id}/items")
    public Map<String, Object> addItem(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        return Api.ok(service.addItem(Auth.current(request).id(), id, String.valueOf(body.get("exerciseId")),
                body.get("note") == null ? null : String.valueOf(body.get("note"))));
    }

    @PatchMapping("/{id}/items/{itemId}")
    public Map<String, Object> updateItem(@PathVariable String id, @PathVariable String itemId,
                                          @RequestBody Map<String, Object> body, HttpServletRequest request) {
        service.owned(Auth.current(request).id(), id, false);
        return Api.ok(service.updateItem(Auth.current(request).id(), itemId, body.get("note") == null ? null : String.valueOf(body.get("note"))));
    }

    @DeleteMapping("/{id}/items/{itemId}")
    public Map<String, Object> removeItem(@PathVariable String id, @PathVariable String itemId, HttpServletRequest request) {
        service.owned(Auth.current(request).id(), id, false);
        return Api.ok(service.removeItem(Auth.current(request).id(), itemId));
    }

    @PostMapping("/{id}/items/{itemId}/sets")
    public Map<String, Object> addSet(@PathVariable String id, @PathVariable String itemId,
                                      @RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        service.owned(user.id(), id, false);
        Map<String, Object> result = service.addSet(user.id(), itemId, body);
        result.put("newBadges", badges.evaluate(user.id(), checkins.streak(user.id(), user.tzOffset()),
                result.get("prs") instanceof List<?> list && !list.isEmpty()));
        audit.track(user.id(), "set_logged", Map.of("set_type", body.get("setType") == null ? "normal" : body.get("setType"),
                "weight", body.getOrDefault("weightKg", ""), "reps", body.getOrDefault("reps", ""), "rpe", body.getOrDefault("rpe", "")));
        return Api.ok(result);
    }

    @PatchMapping("/{id}/sets/{setId}")
    public Map<String, Object> updateSet(@PathVariable String id, @PathVariable String setId,
                                         @RequestBody Map<String, Object> body, HttpServletRequest request) {
        service.owned(Auth.current(request).id(), id, false);
        return Api.ok(service.updateSet(Auth.current(request).id(), setId, body));
    }

    @DeleteMapping("/{id}/sets/{setId}")
    public Map<String, Object> deleteSet(@PathVariable String id, @PathVariable String setId, HttpServletRequest request) {
        service.owned(Auth.current(request).id(), id, false);
        return Api.ok(service.deleteSet(Auth.current(request).id(), setId));
    }

    @PostMapping("/{id}/media")
    public Map<String, Object> attachMedia(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        service.owned(user.id(), id, false);
        List<String> ids = body.get("mediaIds") instanceof List<?> list ? list.stream().map(String::valueOf).toList() : List.of();
        return Api.ok(Map.of("media", media.attach(user, id, ids)));
    }

    @PostMapping("/{id}/template")
    public ResponseEntity<Map<String, Object>> template(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        String name = body.get("name") == null ? "" : String.valueOf(body.get("name"));
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.saveAsTemplate(Auth.current(request).id(), id, name)));
    }

    @PostMapping("/{id}/sync-checkin")
    public Map<String, Object> syncCheckin(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> session = service.owned(user.id(), id, false);
        checkins.syncAuto(user.id(), (String) session.get("local_date"));
        return Api.ok(Map.of("checkin", checkins.day(user.id(), (String) session.get("local_date"), user.tzOffset())));
    }
}
