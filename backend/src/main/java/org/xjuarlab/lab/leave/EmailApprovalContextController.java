package org.xjuarlab.lab.leave;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.*;

/** Retains a capability hash in the HttpOnly session; never consumes it on opening. */
@RestController
public class EmailApprovalContextController {
    public static final String SESSION_KEY = "lab.leaveApprovalHash";
    private final ApprovalTokenCryptography crypto;
    public EmailApprovalContextController(ApprovalTokenCryptography crypto) { this.crypto = crypto; }

    @PostMapping("/api/v1/leaves/email-action/context")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void remember(HttpServletRequest request, @Valid @RequestBody Context input) {
        request.getSession(true).setAttribute(SESSION_KEY, crypto.hash(input.token()));
    }
    public record Context(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{43}") String token) {}
}
