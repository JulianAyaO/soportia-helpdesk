package com.soportia.realtime;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final RealtimeHandler handler;
    private final JwtHandshakeInterceptor interceptor;

    public WebSocketConfig(RealtimeHandler handler, JwtHandshakeInterceptor interceptor) {
        this.handler = handler;
        this.interceptor = interceptor;
    }

    @Bean
    @Profile("!test")
    public ServletServerContainerFactoryBean websocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(256 * 1024);
        container.setMaxBinaryMessageBufferSize(256 * 1024);
        return container;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/realtime")
                .addInterceptors(interceptor)
                .setAllowedOriginPatterns(
                        "http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*",
                        "http://192.168.*:*", "http://10.*:*", "http://172.*:*",
                        "https://localhost:*", "https://127.0.0.1:*", "https://[::1]:*",
                        "https://192.168.*:*", "https://10.*:*", "https://172.*:*");
    }
}
