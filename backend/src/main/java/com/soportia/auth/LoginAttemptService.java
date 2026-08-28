package com.soportia.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LoginAttemptService {
    private static final int MAX_FAILURES=5;
    private static final Duration BLOCK_TIME=Duration.ofMinutes(15);
    private final ConcurrentHashMap<String,Attempt> attempts=new ConcurrentHashMap<>();

    public void check(String email,String remoteAddress){
        Attempt attempt=attempts.get(key(email,remoteAddress));
        if(attempt!=null&&attempt.blockedUntil()!=null&&attempt.blockedUntil().isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many login attempts. Try again later.");
    }

    public void failed(String email,String remoteAddress){
        String key=key(email,remoteAddress);
        attempts.compute(key,(ignored,current)->{
            int failures=current==null?1:current.failures()+1;
            return new Attempt(failures,failures>=MAX_FAILURES?Instant.now().plus(BLOCK_TIME):null);
        });
    }

    public void succeeded(String email,String remoteAddress){
        attempts.remove(key(email,remoteAddress));
    }

    private String key(String email,String remoteAddress){
        return email.toLowerCase(Locale.ROOT)+"|"+remoteAddress;
    }

    private record Attempt(int failures,Instant blockedUntil){}
}
