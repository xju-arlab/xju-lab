package org.xjuarlab.lab.api;

import java.util.Map;

public record ApiError(String code, String message, String requestId, Map<String, String> fieldErrors) { }
