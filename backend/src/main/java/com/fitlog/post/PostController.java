package com.fitlog.post;

import com.fitlog.auth.Auth;
import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/posts")
public class PostController {
    private final PostService service;

    public PostController(PostService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String status, HttpServletRequest request) {
        return Api.ok(service.listMyPosts(Auth.current(request).id(), status));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.create(Auth.current(request).id(), body)));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.myPost(Auth.current(request).id(), id));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        return Api.ok(service.update(Auth.current(request).id(), id, body));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id, HttpServletRequest request) {
        service.delete(Auth.current(request).id(), id);
        return Api.ok(Map.of("deleted", true));
    }

    @PostMapping("/{id}/publish")
    public Map<String, Object> publish(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                       HttpServletRequest request) {
        return Api.ok(service.publish(Auth.current(request).id(), id, body == null ? Map.of() : body));
    }

    @PostMapping("/{id}/unpublish")
    public Map<String, Object> unpublish(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.unpublish(Auth.current(request).id(), id));
    }

    @GetMapping("/{id}/versions")
    public Map<String, Object> versions(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(Map.of("items", service.versions(Auth.current(request).id(), id)));
    }

    @PostMapping("/{id}/versions")
    public ResponseEntity<Map<String, Object>> snapshot(@PathVariable String id, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(Map.of("items", service.snapshot(Auth.current(request).id(), id))));
    }

    @PostMapping("/{id}/versions/{versionId}/restore")
    public Map<String, Object> restore(@PathVariable String id, @PathVariable String versionId, HttpServletRequest request) {
        return Api.ok(service.restore(Auth.current(request).id(), id, versionId));
    }

    @PostMapping("/{id}/lock")
    public Map<String, Object> lock(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        String device = body.get("device") == null ? "unknown" : String.valueOf(body.get("device"));
        return Api.ok(service.lock(Auth.current(request).id(), id, device));
    }

    @PostMapping("/{id}/takeover")
    public Map<String, Object> takeover(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        String device = body.get("device") == null ? "unknown" : String.valueOf(body.get("device"));
        return Api.ok(service.takeover(Auth.current(request).id(), id, device));
    }

    @PostMapping("/{id}/unlock")
    public Map<String, Object> unlock(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        String device = body == null || body.get("device") == null ? "" : String.valueOf(body.get("device"));
        service.unlock(Auth.current(request).id(), id, device);
        return Api.ok(Map.of("released", true));
    }

    @PostMapping("/{id}/appeal")
    public ResponseEntity<Map<String, Object>> appeal(@PathVariable String id, @RequestBody Map<String, Object> body,
                                                      HttpServletRequest request) {
        String reason = body.get("reason") == null ? "" : String.valueOf(body.get("reason")).trim();
        if (reason.length() < 5) throw com.fitlog.common.ApiException.badRequest("请填写至少 5 个字的申诉说明");
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.appeal(Auth.current(request).id(), id, reason)));
    }
}
