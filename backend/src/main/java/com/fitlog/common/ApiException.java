package com.fitlog.common;

public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final Object details;

    public ApiException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(int status, String code, String message, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public int getStatus() { return status; }
    public String getCode() { return code; }
    public Object getDetails() { return details; }

    public static ApiException badRequest(String message) { return new ApiException(400, "BAD_REQUEST", message); }
    public static ApiException unauthorized(String message) { return new ApiException(401, "UNAUTHORIZED", message); }
    public static ApiException forbidden(String message) { return new ApiException(403, "FORBIDDEN", message); }
    public static ApiException notFound(String message) { return new ApiException(404, "NOT_FOUND", message); }
    public static ApiException conflict(String message) { return new ApiException(409, "CONFLICT", message); }
    public static ApiException tooMany(String message) { return new ApiException(429, "TOO_MANY_REQUESTS", message); }
}
