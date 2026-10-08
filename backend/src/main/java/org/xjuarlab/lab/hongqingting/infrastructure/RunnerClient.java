package org.xjuarlab.lab.hongqingting.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;
import java.util.zip.GZIPOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.hongqingting.domain.RunnerContracts.*;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

/** Fixed-purpose adapter for the existing runner wire protocol. No browser-supplied URL or credential. */
@Component
public class RunnerClient {
    private final ObjectMapper mapper;
    private final String summaryUrl, uploadUrl, schoolNo, queryUid, uploadUid;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();
    private static final Pattern KILOMETRES = Pattern.compile("(-?\\d+(?:\\.\\d+)?)\\s*公里");
    private static final String ANDROID_UA = "Dalvik/2.1.0 (Linux; U; Android 12; LIO-AN00 Build/PQ3B.190801.002)";

    public RunnerClient(ObjectMapper mapper,
            @Value("${lab.hongqingting.summary-url:}") String summaryUrl,
            @Value("${lab.hongqingting.upload-url:}") String uploadUrl,
            @Value("${lab.hongqingting.school-no:}") String schoolNo,
            @Value("${lab.hongqingting.query-uid:}") String queryUid,
            @Value("${lab.hongqingting.upload-uid:}") String uploadUid) {
        this.mapper=mapper; this.summaryUrl=summaryUrl; this.uploadUrl=uploadUrl;
        this.schoolNo=schoolNo; this.queryUid=queryUid; this.uploadUid=uploadUid;
        boolean any = List.of(summaryUrl,uploadUrl,schoolNo,queryUid,uploadUid).stream().anyMatch(s -> !s.isBlank());
        if (any && (!validUrl(summaryUrl) || !validUrl(uploadUrl) || !schoolNo.matches("[0-9]{1,12}")
                || !safeUid(queryUid) || !safeUid(uploadUid)))
            throw new IllegalStateException("红蜻蜓配置不完整或格式不合法，请检查服务端配置");
    }

    private static boolean validUrl(String value) {
        try {
            URI uri = URI.create(value);
            return List.of("http","https").contains(uri.getScheme()) && uri.getHost()!=null
                && uri.getUserInfo()==null && uri.getFragment()==null && uri.getQuery()==null;
        } catch (RuntimeException ex) { return false; }
    }
    private static boolean safeUid(String value) { return value.matches("[A-Za-z0-9_$=.+/-]{1,512}"); }
    public boolean configured() { return !summaryUrl.isBlank(); }
    public void requireConfigured() {
        if (!configured()) throw new ResponseStatusException(SERVICE_UNAVAILABLE,"红蜻蜓尚未接入，请由运维配置上游服务");
    }
    public Configuration configuration() {
        return new Configuration(configured(), configured() ? schoolNo : null, List.of(
            new Track("location_1_6km","1.6 公里",true),
            new Track("location_1km","1 公里（未验证）",false),
            new Track("location_1_16km","1.16 公里（未验证）",false),
            new Track("location_12km","12 公里（未验证）",false)),90);
    }

    public Summary summary(String studentNo) {
        requireConfigured();
        try {
            var response = send(summaryUrl, "{'studentno':"+studentNo+",'uid':'"+queryUid+"','schoolno':'"+schoolNo+"'}", ANDROID_UA);
            if (response.statusCode()/100 != 2) throw new IllegalStateException();
            JsonNode node = mapper.readTree(response.body());
            if (node == null || !node.isObject()) throw new IllegalStateException();
            String message = safeMessage(node);
            var match = KILOMETRES.matcher(message);
            java.math.BigDecimal distance = match.find() ? new java.math.BigDecimal(match.group(1)) : null;
            String last = null;
            if (node.path("lasttime").canConvertToLong()) {
                long time = node.path("lasttime").asLong();
                if (time>0 && time<253402300800L) last = Instant.ofEpochSecond(time).toString();
            }
            return new Summary(distance,last,message);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(SERVICE_UNAVAILABLE,"里程查询已中断，请重试");
        } catch (Exception ex) {
            throw new ResponseStatusException(SERVICE_UNAVAILABLE,"里程查询失败，请稍后重试");
        }
    }

    public Outcome upload(Attempt attempt) {
        requireConfigured();
        final String payload;
        try { payload = uploadPayload(attempt); }
        catch (Exception ex) { return new Outcome("FAILED","轨迹未能生成，未发送请求"); }
        try {
            var response = send(uploadUrl,payload,"okhttp/5.0.0-alpha.10");
            if (response.statusCode()/100 != 2)
                return new Outcome("UNKNOWN","上游返回 HTTP "+response.statusCode()+"，提交结果待核实，未自动重试");
            JsonNode node;
            try { node=mapper.readTree(response.body()); } catch (Exception ex) { node=null; }
            // HTTP success is transport evidence only; do not invent an upstream business success schema.
            if (node!=null && (node.path("success").isBoolean() && !node.path("success").asBoolean()))
                return new Outcome("FAILED","上游拒绝："+truncate(safeMessage(node),380));
            return new Outcome("RECEIVED", node!=null && !safeMessage(node).isBlank()
                ? safeMessage(node) : "已收到上游响应，是否计入里程请查询确认");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return new Outcome("UNKNOWN","请求中断，提交结果待核实，未自动重试");
        } catch (Exception ex) {
            return new Outcome("UNKNOWN","网络异常，提交结果待核实，未自动重试");
        }
    }

    private String uploadPayload(Attempt attempt) throws Exception {
        var random=ThreadLocalRandom.current();
        long begin, end;
        if (attempt.dayOffset()!=0) {
            begin=(long)(attempt.referenceTime()-86400*attempt.dayOffset()+random.nextInt(1,3601));
            end=begin+320+random.nextInt(1,101);
        } else {
            end=attempt.referenceTime()-random.nextInt(1,3601);
            begin=end-320-random.nextInt(1,101);
        }
        int duration=(int)(end-begin)-random.nextInt(1,11);
        double distance=1600+random.nextDouble(-50,50);
        String track;
        try (var stream=new ClassPathResource("hongqingting/location_1_6km").getInputStream()) {
            track=new String(stream.readAllBytes(),StandardCharsets.UTF_8);
        }
        String[] frames=track.strip().split("@");
        var rewritten=new java.util.ArrayList<String>();
        for (int i=0;i<frames.length;i++) {
            String[] fields=frames[i].split(";",-1);
            if (fields.length<4 || !fields[0].matches("[0-9.,-]+") || !fields[2].equals("null") || !fields[3].equals("null"))
                throw new IllegalStateException("Invalid trajectory");
            fields[1]=Long.toString((long)(begin+(double)duration*i/frames.length));
            rewritten.add(String.join(";",fields));
        }
        String location=String.join("@",rewritten);
        if (location.contains("'") || location.contains("\\") || rewritten.isEmpty()) throw new IllegalStateException();
        return "{'begintime':'"+begin+"','endtime':'"+end+"','uid':'"+uploadUid+"','schoolno':'"+schoolNo
            +"','distance':'"+String.format(Locale.ROOT,"%.1f",distance)+"','speed':'"+(duration/60.0/(distance/1000))
            +"','studentno':'"+attempt.studentNo()+"','atttype':'3','eventno':'803','location':'"+location
            +"','pointstatus':'1','usetime':'"+duration+"','path':'null'}";
    }

    private HttpResponse<byte[]> send(String url, String payload, String userAgent) throws Exception {
        var bytes=new ByteArrayOutputStream();
        try(var gzip=new GZIPOutputStream(bytes)) { gzip.write(payload.getBytes(StandardCharsets.UTF_8)); }
        var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
            .header("Content-Type","application/x-www-form-urlencoded").header("User-Agent",userAgent)
            .header("Accept-Language","en-US,en;q=0.9")
            .POST(HttpRequest.BodyPublishers.ofByteArray(bytes.toByteArray())).build();
        return http.send(request,info -> new LimitedBody());
    }
    private String safeMessage(JsonNode node) {
        String text=node.path("m").isTextual() ? node.path("m").asText() : node.path("message").asText("");
        for(String secret:List.of(queryUid,uploadUid,summaryUrl,uploadUrl)) if (!secret.isBlank()) text=text.replace(secret,"[已隐藏]");
        return truncate(text.replaceAll("https?://\\S+","[已隐藏]").replaceAll("[\\p{Cntrl}&&[^\\n\\t]]",""),400);
    }
    private static String truncate(String text,int max) { return text.substring(0,Math.min(text.length(),max)); }
    private static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate=HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private int size;
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        public void onSubscribe(Flow.Subscription value) { subscription=value; delegate.onSubscribe(value); }
        public void onNext(List<ByteBuffer> data) {
            for(var buffer:data) size+=buffer.remaining();
            if(size>65536) { subscription.cancel(); delegate.onError(new IllegalStateException("Response too large")); }
            else delegate.onNext(data);
        }
        public void onError(Throwable error) { delegate.onError(error); }
        public void onComplete() { delegate.onComplete(); }
    }
}
