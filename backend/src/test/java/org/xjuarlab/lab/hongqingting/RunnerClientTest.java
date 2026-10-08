package org.xjuarlab.lab.hongqingting;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.*;
import org.xjuarlab.lab.hongqingting.domain.RunnerContracts.Attempt;
import org.xjuarlab.lab.hongqingting.infrastructure.RunnerClient;
import static org.assertj.core.api.Assertions.*;

class RunnerClientTest {
    HttpServer server;
    String base;
    AtomicReference<String> response = new AtomicReference<>("{\"m\":\"累计 12.3 公里\",\"lasttime\":1700000000}");
    AtomicReference<String> payload = new AtomicReference<>();
    AtomicInteger status = new AtomicInteger(200);
    AtomicInteger calls = new AtomicInteger();
    @BeforeEach void start() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        base="http://127.0.0.1:"+server.getAddress().getPort();
        server.createContext("/wire",exchange -> {
            calls.incrementAndGet();
            try(var gzip=new GZIPInputStream(exchange.getRequestBody())) {
                payload.set(new String(gzip.readAllBytes(),StandardCharsets.UTF_8));
            }
            if(status.get()==302) exchange.getResponseHeaders().add("Location",base+"/should-not-follow");
            byte[] body=response.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(),body.length);
            exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
    }
    @AfterEach void stop() { server.stop(0); }
    RunnerClient client() { return new RunnerClient(new ObjectMapper(),base+"/wire",base+"/wire","10755","test-query-uid","test-upload-uid"); }
    Attempt attempt() { return new Attempt(UUID.randomUUID(),UUID.randomUUID(),"20269999999",1,Instant.now().getEpochSecond()); }

    @Test void queriesUsingGzipAndReturnsOnlySafeMileageFields() {
        var result=client().summary("20269999999");
        assertThat(payload.get()).isEqualTo("{'studentno':20269999999,'uid':'test-query-uid','schoolno':'10755'}");
        assertThat(result.distanceKm()).isEqualByComparingTo("12.3");
        assertThat(result.lastRunAt()).isEqualTo("2023-11-14T22:13:20Z");
        response.set("{\"message\":\"test-query-uid test-upload-uid http://secret.invalid/path\",\"raw\":\"test-query-uid\"}");
        var unknown=client().summary("20269999999");
        assertThat(unknown.distanceKm()).isNull();
        assertThat(unknown.message()).doesNotContain("test-query-uid","test-upload-uid","secret.invalid");
    }
    @Test void uploadsRewrittenTrajectoryAndDoesNotEquateHttpResponseWithBusinessSuccess() {
        var attempt=attempt();
        var result=client().upload(attempt);
        assertThat(result.status()).isEqualTo("RECEIVED");
        assertThat(payload.get()).contains("'uid':'test-upload-uid'","'studentno':'20269999999'","'atttype':'3'","'eventno':'803'");
        String location=payload.get().split("'location':'",2)[1].split("'",2)[0];
        String[] frames=location.split("@");
        assertThat(frames).hasSize(226);
        long last=0;
        for(String frame:frames) {
            long timestamp=Long.parseLong(frame.split(";")[1]);
            assertThat(timestamp).isGreaterThanOrEqualTo(last);
            assertThat(timestamp).isBetween(attempt.referenceTime()-86400,attempt.referenceTime()-80000);
            last=timestamp;
        }
        response.set("{\"success\":false,\"message\":\"rejected\"}");
        assertThat(client().upload(attempt).status()).isEqualTo("FAILED");
    }
    @Test void refusesRedirectsAndBoundsResponsesWithoutRetryingUploads() {
        status.set(302);
        assertThat(client().upload(attempt()).status()).isEqualTo("UNKNOWN");
        assertThat(calls.get()).isEqualTo(1);
        status.set(500);
        assertThat(client().upload(attempt()).status()).isEqualTo("UNKNOWN");
        assertThat(calls.get()).isEqualTo(2);
        status.set(200); response.set("x".repeat(70000));
        assertThat(client().upload(attempt()).status()).isEqualTo("UNKNOWN");
        assertThat(calls.get()).isEqualTo(3);
    }
    @Test void requiresCompleteServerConfigurationAndRejectsInjectedCredentials() {
        var disabled=new RunnerClient(new ObjectMapper(),"","","","","");
        assertThat(disabled.configuration().configured()).isFalse();
        assertThatThrownBy(()->disabled.summary("20269999999")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->new RunnerClient(new ObjectMapper(),base+"/wire","","10755","x","y")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->new RunnerClient(new ObjectMapper(),base+"/wire",base+"/wire","10755","x'","y")).isInstanceOf(IllegalStateException.class);
        assertThat(client().configuration().tracks()).filteredOn(t->t.available()).hasSize(1);
    }
}
