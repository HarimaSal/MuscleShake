package com.fitlog.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(error(e.getCode(), e.getMessage(), e.getDetails()));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, Object>> duplicate(DuplicateKeyException e) {
        log.warn("duplicate key: {}", e.getMessage());
        return ResponseEntity.status(409).body(error("CONFLICT", "记录已存在或重复提交", null));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<Map<String, Object>> badRequest(Exception e) {
        return ResponseEntity.status(400).body(error("BAD_REQUEST", "请求参数格式不正确", null));
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<Map<String, Object>> notFound(Exception e) {
        return ResponseEntity.status(404).body(error("NOT_FOUND", "接口不存在", null));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception e) {
        log.error("unexpected error", e);
        return ResponseEntity.status(500).body(error("SERVER_ERROR", "服务暂时不可用，请稍后重试", null));
    }

    private Map<String, Object> error(String code, String message, Object details) {
        M error = M.of().put("code", code).put("message", message);
        if (details != null) error.put("details", details);
        return M.of().put("error", error);
    }
}
