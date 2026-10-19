package com.fitlog.ops;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** 后台独立的密码、令牌与 TOTP 工具，不复用前台鉴权。 */
public final class OpsCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private OpsCrypto() {}

    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String randomCode(int length) {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) sb.append(chars.charAt(RANDOM.nextInt(chars.length())));
        return sb.toString();
    }

    public static String randomTotpSecret() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 16; i++) sb.append(chars.charAt(RANDOM.nextInt(chars.length())));
        return sb.toString();
    }

    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String passwordHash(String password, String salt) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), Base64.getDecoder().decode(salt), 120_000, 256);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return Base64.getEncoder().encodeToString(factory.generateSecret(spec).getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static boolean verifyPassword(String password, String salt, String hash) {
        if (password == null || salt == null || hash == null) return false;
        return MessageDigest.isEqual(passwordHash(password, salt).getBytes(StandardCharsets.UTF_8), hash.getBytes(StandardCharsets.UTF_8));
    }

    public static String newSalt() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    public static String totp(String secret) {
        return totp(secret, System.currentTimeMillis() / 1000 / 30);
    }

    public static boolean verifyTotp(String secret, String code) {
        if (secret == null || code == null) return false;
        long counter = System.currentTimeMillis() / 1000 / 30;
        for (long offset = -1; offset <= 1; offset++) {
            if (totp(secret, counter + offset).equals(code.trim())) return true;
        }
        return false;
    }

    private static String totp(String secret, long counter) {
        try {
            byte[] key = base32(secret);
            byte[] data = new byte[8];
            for (int i = 7; i >= 0; i--) {
                data[i] = (byte) (counter & 0xff);
                counter >>= 8;
            }
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(data);
            int offset = hash[hash.length - 1] & 0xf;
            int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
                    | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
            return String.format("%06d", binary % 1_000_000);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] base32(String secret) {
        String normalized = secret.replace("=", "").replace(" ", "").toUpperCase();
        int bits = 0;
        int value = 0;
        byte[] out = new byte[normalized.length() * 5 / 8];
        int index = 0;
        for (char c : normalized.toCharArray()) {
            int digit = BASE32.indexOf(c);
            if (digit < 0) throw new IllegalArgumentException("invalid base32");
            value = (value << 5) | digit;
            bits += 5;
            if (bits >= 8) {
                out[index++] = (byte) ((value >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        byte[] trimmed = new byte[index];
        System.arraycopy(out, 0, trimmed, 0, index);
        return trimmed;
    }
}
