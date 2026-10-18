package com.fitlog.common;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimiter {
    private record Bucket(long resetAt, int count) {}
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public boolean allow(String key, int limit, long windowMillis) {
        long now = System.currentTimeMillis();
        Bucket bucket = buckets.compute(key, (k, old) -> {
            if (old == null || old.resetAt() <= now) return new Bucket(now + windowMillis, 1);
            return new Bucket(old.resetAt(), old.count() + 1);
        });
        return bucket.count() <= limit;
    }
}
