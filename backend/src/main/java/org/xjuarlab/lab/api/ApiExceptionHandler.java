package org.xjuarlab.lab.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> uploadSize(HttpServletRequest request) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE,"UPLOAD_TOO_LARGE","单个附件最多 10 MB，合计最多 25 MB",Map.of(),request);
    }
    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,org.springframework.web.multipart.support.MissingServletRequestPartException.class,org.springframework.web.multipart.MultipartException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        org.springframework.web.bind.MissingRequestHeaderException.class,
        org.springframework.web.bind.MissingServletRequestParameterException.class})
    ResponseEntity<ApiError> malformedInput(HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST,"INVALID_PAYLOAD","请求内容无效，请检查表单或重新选择附件",Map.of(),request);
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        var fields = ex.getBindingResult().getFieldErrors().stream().collect(java.util.stream.Collectors.toMap(
            e -> e.getField(), e -> e.getDefaultMessage() == null ? "Invalid value" : e.getDefaultMessage(), (a,b) -> a));
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "请求参数不合法", fields, request);
    }
    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> constraint(ConstraintViolationException ex, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "请求参数不合法", Map.of(), request);
    }
    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<ApiError> conflict(DuplicateKeyException ex, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "资源状态已变化或已存在", Map.of(), request);
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> integrityConflict(DataIntegrityViolationException ex, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "资源状态已变化或时间范围冲突", Map.of(), request);
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> status(ResponseStatusException ex, HttpServletRequest request) {
        var code = ex.getStatusCode().value() == 404 ? "NOT_FOUND" : ex.getStatusCode().value() == 409 ? "CONFLICT" : "REQUEST_REJECTED";
        return error(HttpStatus.valueOf(ex.getStatusCode().value()), code, ex.getReason() == null ? "请求未完成" : ex.getReason(), Map.of(), request);
    }
    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    ResponseEntity<ApiError> notFound(Exception ex, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的接口不存在", Map.of(), request);
    }
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> forbidden(HttpServletRequest request) {
        return error(HttpStatus.FORBIDDEN, "FORBIDDEN", "没有执行此操作的权限", Map.of(), request);
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled API error requestId={} path={}", requestId(request), request.getRequestURI(), ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务暂时无法完成请求", Map.of(), request);
    }
    private ResponseEntity<ApiError> error(HttpStatus status, String code, String message, Map<String,String> fields, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiError(code, message, requestId(request), fields));
    }
    private String requestId(HttpServletRequest request) { return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE); }
}
