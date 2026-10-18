package com.fitlog.post;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.M;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/public/posts")
public class PublicController {
    private final PostService service;
    private final AuditService audit;

    public PublicController(PostService service, AuditService audit) {
        this.service = service;
        this.audit = audit;
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = Auth.optional(request);
        String device = request.getHeader("X-Device-Id");
        Map<String, Object> data = service.publicPost(id, user == null ? null : user.id(), device == null ? "anonymous-device" : device, false);
        audit.track(user == null ? null : user.id(), "public_page_view", Map.of("post_id", id, "is_login", user != null, "referrer", String.valueOf(request.getHeader("Referer"))));
        return Api.ok(data);
    }

    @PostMapping("/{id}/report")
    public ResponseEntity<Map<String, Object>> report(@PathVariable String id, @RequestBody Map<String, Object> body,
                                                      HttpServletRequest request) {
        AuthUser user = Auth.optional(request);
        String reason = body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        if (reason.isBlank()) throw ApiException.badRequest("请选择举报原因");
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.report(id, user == null ? null : user.id(), body)));
    }

    @GetMapping("/{id}/share-card")
    public Map<String, Object> shareCard(@PathVariable String id, HttpServletRequest request) {
        String origin = request.getScheme() + "://" + request.getServerName() + (request.getServerPort() == 80 || request.getServerPort() == 443 ? "" : ":" + request.getServerPort());
        Map<String, Object> data = service.shareCard(id, origin);
        String url = String.valueOf(data.get("url"));
        data.put("qrSvg", qrSvg(url));
        audit.track(null, "share_card_generate", Map.of("post_id", id, "channel", "share"));
        return Api.ok(data);
    }

    @GetMapping("/{id}/meta")
    public Map<String, Object> meta(@PathVariable String id) {
        Map<String, Object> data = service.publicPost(id, null, null, true);
        return Api.ok(M.of().put("id", data.get("id")).put("title", data.get("title")).put("summary", data.get("summary"))
                .put("coverUrl", data.get("coverUrl")).put("author", data.get("author")).put("publishedAt", data.get("publishedAt"))
                .put("allowIndex", data.get("allowIndex")).put("visibility", data.get("visibility")).map());
    }

    private String qrSvg(String url) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 220, 220, Map.of());
            StringBuilder sb = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"220\" height=\"220\" viewBox=\"0 0 220 220\"><rect width=\"220\" height=\"220\" fill=\"#ffffff\"/>");
            for (int y = 0; y < matrix.getHeight(); y++) {
                for (int x = 0; x < matrix.getWidth(); x++) {
                    if (matrix.get(x, y)) sb.append("<rect x=\"").append(x).append("\" y=\"").append(y).append("\" width=\"1\" height=\"1\" fill=\"#0c0d0b\"/>");
                }
            }
            return sb.append("</svg>").toString();
        } catch (Exception e) {
            throw new ApiException(500, "QR_ERROR", "分享二维码生成失败");
        }
    }
}
