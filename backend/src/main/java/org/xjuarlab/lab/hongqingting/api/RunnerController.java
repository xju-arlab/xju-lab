package org.xjuarlab.lab.hongqingting.api;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.security.CurrentMember;
import org.xjuarlab.lab.hongqingting.application.RunnerBatches;
import org.xjuarlab.lab.hongqingting.domain.RunnerContracts.*;
import org.xjuarlab.lab.hongqingting.infrastructure.RunnerClient;

@RestController
@RequestMapping("/api/v1/admin/hongqingting")
public class RunnerController {
    private final CurrentMember members;
    private final RunnerClient client;
    private final RunnerBatches batches;
    public RunnerController(CurrentMember members,RunnerClient client,RunnerBatches batches) {
        this.members=members; this.client=client; this.batches=batches;
    }
    private UUID admin(Authentication auth) {
        UUID id=members.id(auth); members.requireRole(id,"LAB_ADMIN","SUPER_ADMIN"); return id;
    }
    @GetMapping("/configuration") public Configuration configuration(Authentication auth) {
        admin(auth); return client.configuration();
    }
    @PostMapping("/summary") public Summary summary(Authentication auth,@Valid @RequestBody SummaryRequest body) {
        admin(auth); return client.summary(body.studentNo());
    }
    @PostMapping("/batches") public Batch create(Authentication auth,@RequestHeader("Idempotency-Key") UUID key,
            @Valid @RequestBody BatchRequest body) {
        return batches.create(admin(auth),key,body);
    }
    @GetMapping("/batches") public PageEnvelope<Batch> list(Authentication auth,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="10") int pageSize) {
        return batches.list(admin(auth),page,pageSize);
    }
    @GetMapping("/batches/{id}") public Batch read(Authentication auth,@PathVariable UUID id) {
        return batches.read(admin(auth),id);
    }
    @PostMapping("/batches/{id}/cancel") public Batch cancel(Authentication auth,@PathVariable UUID id,
            @RequestHeader("If-Match-Version") long version) {
        return batches.cancel(admin(auth),id,version);
    }
}
