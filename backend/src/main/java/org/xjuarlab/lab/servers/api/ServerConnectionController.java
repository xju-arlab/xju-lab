package org.xjuarlab.lab.servers.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.xjuarlab.lab.security.CurrentMember;
import org.xjuarlab.lab.servers.application.ServerConnections;

@RestController
@RequestMapping("/api/v1/monitor/admin/ssh")
public class ServerConnectionController {
    private final CurrentMember current;
    private final ServerConnections service;
    public ServerConnectionController(CurrentMember current, ServerConnections service){this.current=current;this.service=service;}
    private UUID admin(Authentication auth){UUID id=current.id(auth);current.requireRole(id,"LAB_ADMIN","SUPER_ADMIN");return id;}
    @GetMapping("/config") public Object config(Authentication auth){admin(auth);return service.config(null);}
    @PostMapping("/config/parse") public Object parse(Authentication auth,@Valid @RequestBody Config input){admin(auth);return service.config(input.config());}
    @PostMapping("/connections") public Object create(Authentication auth,@Valid @RequestBody Create input){return service.create(admin(auth),input.name(),input.config(),input.alias());}
    @PostMapping("/connections/{id}/connect") public Object connect(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Connect input){return service.connect(admin(auth),id,input.password(),input.trustHost());}
    @PostMapping("/connections/{id}/save") public Object save(Authentication auth,@PathVariable UUID id){return service.save(admin(auth),id);}
    @DeleteMapping("/connections/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void cancel(Authentication auth,@PathVariable UUID id){service.cancel(admin(auth),id);}
    public record Config(@Size(max=32768) @NotBlank String config){}
    public record Create(@NotBlank @Size(max=120) String name,@NotBlank @Size(max=32768) String config,@NotBlank @Size(max=120) String alias){}
    public record Connect(@Size(max=1024) String password,boolean trustHost){}
}
