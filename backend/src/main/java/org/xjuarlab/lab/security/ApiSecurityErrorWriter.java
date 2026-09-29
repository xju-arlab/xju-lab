package org.xjuarlab.lab.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import org.xjuarlab.lab.api.ApiError;
import org.xjuarlab.lab.api.RequestIdFilter;

@Component
public class ApiSecurityErrorWriter {
    private final ObjectMapper mapper;
    public ApiSecurityErrorWriter(ObjectMapper mapper) { this.mapper = mapper; }
    public AuthenticationEntryPoint authenticationEntryPoint() { return (request, response, exception) -> write(response, request, HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "请先使用实验室统一身份登录"); }
    public AccessDeniedHandler accessDeniedHandler() { return (request, response, exception) -> write(response, request, HttpStatus.FORBIDDEN, "FORBIDDEN", "没有执行此操作的权限"); }
    private void write(HttpServletResponse response, HttpServletRequest request, HttpStatus status, String code, String message) throws IOException {
        Object value = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        String requestId = value instanceof String id ? id : UUID.randomUUID().toString();
        response.setStatus(status.value()); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        response.setHeader("X-Request-Id", requestId);
        mapper.writeValue(response.getOutputStream(), new ApiError(code, message, requestId, Map.of()));
    }
}
