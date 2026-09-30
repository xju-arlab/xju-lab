package org.xjuarlab.lab.servers.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

/** Credentials travel over stdin only, never command arguments, files, or logs. */
@Component
public class SshWorker {
    private final ObjectMapper mapper;
    private final String python;
    private final String script;
    private final Semaphore slots = new Semaphore(4);
    public SshWorker(ObjectMapper mapper, @Value("${lab.ssh.python:/opt/ssh/bin/python}") String python,
            @Value("${lab.ssh.script:/app/ssh-helper/lab_ssh.py}") String script) {
        this.mapper = mapper; this.python = python; this.script = script;
    }
    public JsonNode run(Object input) {
        if (!slots.tryAcquire()) throw new ResponseStatusException(TOO_MANY_REQUESTS, "连接任务较多，请稍后再试");
        Process process = null;
        try {
            process = new ProcessBuilder(python, script).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            try (var stdin = process.getOutputStream()) { stdin.write(mapper.writeValueAsBytes(input)); }
            // The worker protocol is bounded to <64 KiB; drain concurrently to avoid pipe deadlocks.
            var output = process.getInputStream();
            var read = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                try { return output.readNBytes(65537); } catch (java.io.IOException ex) { throw new java.io.UncheckedIOException(ex); }
            });
            if (!process.waitFor(110, TimeUnit.SECONDS)) throw new ResponseStatusException(GATEWAY_TIMEOUT, "连接超时，请检查网络后重试");
            byte[] bytes = read.get(2, TimeUnit.SECONDS);
            if (process.exitValue() != 0 || bytes.length > 65536) throw new IllegalStateException();
            return mapper.readTree(new String(bytes, StandardCharsets.UTF_8));
        } catch (ResponseStatusException ex) { throw ex; }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new ResponseStatusException(SERVICE_UNAVAILABLE, "连接已中断"); }
        catch (Exception ex) { throw new ResponseStatusException(SERVICE_UNAVAILABLE, "SSH 连接组件不可用，请检查部署配置"); }
        finally { if (process != null) { process.destroyForcibly(); try { process.getInputStream().close(); } catch (Exception ignored) { } } slots.release(); }
    }
}
