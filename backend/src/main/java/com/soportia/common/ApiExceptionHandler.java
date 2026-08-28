package com.soportia.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail validation(MethodArgumentNotValidException e){
        ProblemDetail p=problem(HttpStatus.BAD_REQUEST,"Validation failed","One or more fields are invalid");
        Map<String,String> errors=e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(x->x.getField(),x->x.getDefaultMessage()==null?"invalid":x.getDefaultMessage(),(a,b)->a));
        p.setProperty("errors",errors); return p;
    }
    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail forbidden(AccessDeniedException e){return problem(HttpStatus.FORBIDDEN,"Forbidden",e.getMessage());}
    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail status(ResponseStatusException e){
        return problem(HttpStatus.valueOf(e.getStatusCode().value()),e.getStatusCode().toString(),e.getReason());
    }
    @ExceptionHandler({IllegalArgumentException.class})
    ProblemDetail badRequest(Exception e){return problem(HttpStatus.BAD_REQUEST,"Bad request",e.getMessage());}
    private ProblemDetail problem(HttpStatus status,String title,String detail){
        ProblemDetail p=ProblemDetail.forStatusAndDetail(status,detail==null?title:detail);
        p.setTitle(title);p.setType(URI.create("https://soportia.local/problems/"+status.value()));return p;
    }
}
