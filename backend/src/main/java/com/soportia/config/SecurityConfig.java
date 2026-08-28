package com.soportia.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soportia.auth.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.client.RestClient;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
    @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
    @Bean RestClient.Builder restClientBuilder() {
        SimpleClientHttpRequestFactory requests=new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(3_000);
        requests.setReadTimeout(5_000);
        return RestClient.builder().requestFactory(requests);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOriginPatterns(List.of(
                "http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*",
                "http://192.168.*:*", "http://10.*:*", "http://172.*:*",
                "https://localhost:*", "https://127.0.0.1:*", "https://[::1]:*",
                "https://192.168.*:*", "https://10.*:*", "https://172.*:*"));
        c.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
        c.setAllowedHeaders(List.of("Authorization","Content-Type","X-Soportia-Timestamp",
                "X-Soportia-Signature","X-Idempotency-Key"));
        c.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", c);
        return source;
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http, JwtFilter jwt, ObjectMapper mapper) throws Exception {
        return http.csrf(csrf -> csrf.disable()).cors(c -> {})
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req,res,ex) -> writeProblem(res,mapper,HttpStatus.UNAUTHORIZED,"Unauthorized","Authentication required"))
                        .accessDeniedHandler((req,res,ex) -> writeProblem(res,mapper,HttpStatus.FORBIDDEN,"Forbidden",ex.getMessage())))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/v1/auth/login","/api/v1/auth/refresh",
                                "/api/v1/integrations/n8n/**","/actuator/health",
                                "/v3/api-docs/**","/swagger-ui/**","/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwt, UsernamePasswordAuthenticationFilter.class).build();
    }

    private static void writeProblem(HttpServletResponse response, ObjectMapper mapper, HttpStatus status,
                                     String title, String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail == null || detail.isBlank() ? title : detail);
        problem.setTitle(title);
        problem.setProperty("message", problem.getDetail());
        mapper.writeValue(response.getWriter(), problem);
    }

    public record UserPrincipal(UUID id, String email, String role) {}

    @Component
    public static class JwtFilter extends OncePerRequestFilter {
        private final JwtService jwt;
        JwtFilter(JwtService jwt) { this.jwt = jwt; }
        @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                                   FilterChain chain) throws ServletException, IOException {
            String token = bearer(request);
            if (token == null && request.getServletPath().startsWith("/ws/")) {
                token = request.getParameter("access_token");
            }
            if (token != null) {
                try {
                    Claims c = jwt.parse(token);
                    String role = c.get("role", String.class);
                    UserPrincipal p = new UserPrincipal(UUID.fromString(c.getSubject()), c.get("email", String.class), role);
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(p, null, List.of(new SimpleGrantedAuthority("ROLE_"+role))));
                } catch (Exception ignored) {
                    SecurityContextHolder.clearContext();
                }
            }
            chain.doFilter(request, response);
        }

        private static String bearer(HttpServletRequest request) {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) return auth.substring(7);
            return null;
        }
    }
}
