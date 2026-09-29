package org.xjuarlab.lab.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

@Component
public class PrometheusClient {
    private final String baseUrl;private final String bearerToken;private final HttpClient client;private final ObjectMapper mapper;
    public PrometheusClient(@Value("${lab.monitor.prometheus-url:}") String baseUrl,@Value("${lab.monitor.bearer-token:}") String bearerToken,ObjectMapper mapper){this.baseUrl=baseUrl==null?"":baseUrl.trim().replaceAll("/+$","");this.bearerToken=bearerToken==null?"":bearerToken;this.mapper=mapper;this.client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();}
    public boolean configured(){return !baseUrl.isBlank();}
    public QueryResult instant(String expression){return query("query",expression,null,null,null);}
    public QueryResult range(String expression,Instant start,Instant end,int stepSeconds){return query("query_range",expression,start,end,stepSeconds);}
    public List<Alert> alerts(){if(!configured())return List.of();JsonNode root=request("/api/v1/alerts");JsonNode values=root.path("data").path("alerts");List<Alert> alerts=new ArrayList<>();if(values.isArray())for(JsonNode item:values){Map<String,String> labels=new LinkedHashMap<>();item.path("labels").fields().forEachRemaining(e->labels.put(e.getKey(),e.getValue().asText()));Map<String,String> annotations=new LinkedHashMap<>();item.path("annotations").fields().forEachRemaining(e->annotations.put(e.getKey(),e.getValue().asText()));alerts.add(new Alert(item.path("state").asText("unknown"),labels,annotations,item.path("activeAt").asText("")));}return List.copyOf(alerts);}
    private QueryResult query(String endpoint,String expression,Instant start,Instant end,Integer step){if(!configured())throw new ResponseStatusException(SERVICE_UNAVAILABLE,"监控指标源尚未配置");StringBuilder query=new StringBuilder("/api/v1/").append(endpoint).append("?query=").append(encode(expression));if(start!=null)query.append("&start=").append(encode(start.toString())).append("&end=").append(encode(end.toString())).append("&step=").append(step);JsonNode root=request(query.toString());JsonNode data=root.path("data").path("result");List<Series> rows=new ArrayList<>();if(data.isArray())for(JsonNode item:data){Map<String,String> labels=new LinkedHashMap<>();item.path("metric").fields().forEachRemaining(e->labels.put(e.getKey(),e.getValue().asText()));JsonNode samples=item.path(start==null?"value":"values");List<Sample> parsed=new ArrayList<>();if(samples.isArray()&&samples.size()==2&&samples.get(0).isNumber()){Sample point=sample(samples);if(point!=null)parsed.add(point);}else if(samples.isArray())for(JsonNode pair:samples){Sample point=sample(pair);if(point!=null)parsed.add(point);}rows.add(new Series(labels,List.copyOf(parsed)));}return new QueryResult(List.copyOf(rows));}
    private JsonNode request(String path){try{HttpRequest.Builder request=HttpRequest.newBuilder(URI.create(baseUrl+path)).timeout(Duration.ofSeconds(4)).header("Accept","application/json").GET();if(!bearerToken.isBlank())request.header("Authorization","Bearer "+bearerToken);HttpResponse<String> response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());if(response.statusCode()<200||response.statusCode()>=300)throw new IllegalStateException("Prometheus HTTP "+response.statusCode());JsonNode root=mapper.readTree(response.body());if(!"success".equals(root.path("status").asText()))throw new IllegalStateException("Prometheus returned an error status");return root;}catch(Exception ex){throw new ResponseStatusException(SERVICE_UNAVAILABLE,"监控指标暂时不可用");}}
    private static Sample sample(JsonNode pair){try{double timestamp=pair.get(0).asDouble();String raw=pair.get(1).asText();double value=Double.parseDouble(raw);return Double.isFinite(value)?new Sample(Instant.ofEpochMilli((long)(timestamp*1000)),value):null;}catch(Exception ex){return null;}}
    private static String encode(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8);}
    public record QueryResult(List<Series> series){}
    public record Series(Map<String,String> labels,List<Sample> samples){}
    public record Sample(Instant timestamp,double value){}
    public record Alert(String state,Map<String,String> labels,Map<String,String> annotations,String activeAt){}
}
