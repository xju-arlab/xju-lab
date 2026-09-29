package org.xjuarlab.lab.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.web.filter.OncePerRequestFilter;

public class RequestIdFilter extends OncePerRequestFilter {
    public static final String ATTRIBUTE = "lab.requestId";
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String supplied = request.getHeader("X-Request-Id");
        String id = supplied != null && supplied.matches("[A-Za-z0-9._-]{1,80}") ? supplied : UUID.randomUUID().toString();
        request.setAttribute(ATTRIBUTE, id); response.setHeader("X-Request-Id", id); chain.doFilter(request, response);
    }
}
