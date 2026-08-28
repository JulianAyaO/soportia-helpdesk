package com.soportia.outbox;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

@Component
public class N8nHmac {
    private final byte[] secret;

    public N8nHmac(@Value("${soportia.n8n.hmac-secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public void verify(long timestamp, String signature, String payload) {
        if (Math.abs(Instant.now().getEpochSecond() - timestamp) > 300) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Expired callback");
        }
        String expected = "sha256=" + sign(timestamp + "." + payload);
        byte[] left = expected.getBytes(StandardCharsets.UTF_8);
        byte[] right = signature == null ? new byte[0] : signature.getBytes(StandardCharsets.UTF_8);
        if (left.length != right.length || !MessageDigest.isEqual(left, right)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid callback signature");
        }
    }

    public String canonicalGet(HttpServletRequest request) {
        String query = request.getQueryString();
        return request.getMethod() + " " + request.getRequestURI() + (query == null || query.isBlank() ? "" : "?" + query);
    }

    public String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to sign Soportia payload", ex);
        }
    }
}
