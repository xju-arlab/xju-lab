package org.xjuarlab.lab.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/monitor")
public class MonitoringController {
    private final JdbcTemplate jdbc;private final CurrentMember current;private final PrometheusClient prometheus;private final ObjectMapper mapper;private final int staleSeconds;
    public MonitoringController(JdbcTemplate jdbc,CurrentMember current,PrometheusClient prometheus,ObjectMapper mapper,@Value("${lab.monitor.stale-after-seconds:90}") int staleSeconds){this.jdbc=jdbc;this.current=current;this.prometheus=prometheus;this.mapper=mapper;this.staleSeconds=Math.max(15,staleSeconds);}

    @GetMapping("/assets") public List<AssetView> assets(Authentication auth){current.id(auth);return jdbc.query("SELECT id,name,prometheus_job,target_label,gpu_supported,enabled,version FROM server_asset ORDER BY name,id",(rs,row)->asset(rs));}

    @GetMapping("/assets/{assetId}/metrics") public AssetMetrics metrics(Authentication auth,@PathVariable UUID assetId){current.id(auth);AssetView asset=find(assetId);if(!asset.enabled())return new AssetMetrics(assetId,"DISABLED",List.of());if(!prometheus.configured())return new AssetMetrics(assetId,"PLATFORM_NOT_CONFIGURED",unavailableMetrics("NOT_CONFIGURED",asset.gpuSupported()));if(asset.prometheusJob()==null||asset.targetLabel()==null)return new AssetMetrics(assetId,"ASSET_NOT_CONFIGURED",unavailableMetrics("NOT_CONFIGURED",asset.gpuSupported()));
        String selector="job=\""+escape(asset.prometheusJob())+"\",instance=\""+escape(asset.targetLabel())+"\"";
        try {
            var up=prometheus.instant("up{"+selector+"}");
            if(targetUnreachable(up))
                return new AssetMetrics(assetId,"EXPORTER_UNREACHABLE",unavailableMetrics("EXPORTER_UNREACHABLE",asset.gpuSupported()));
        } catch(ResponseStatusException ex) {
            if(ex.getStatusCode().value()==503)return new AssetMetrics(assetId,"PLATFORM_UNAVAILABLE",unavailableMetrics("PLATFORM_UNAVAILABLE",asset.gpuSupported()));
            throw ex;
        }
        return new AssetMetrics(assetId,"CONNECTED",List.of(read("CPU","%","100 * (1 - avg(rate(node_cpu_seconds_total{"+selector+",mode=\"idle\"}[5m])))"),read("MEMORY","%","100 * (1 - (node_memory_MemAvailable_bytes{"+selector+"} / node_memory_MemTotal_bytes{"+selector+"}))"),read("DISK","%","max(100 * (1 - (node_filesystem_avail_bytes{"+selector+",mountpoint=\"/\",fstype!~\"tmpfs|overlay|squashfs\"} / node_filesystem_size_bytes{"+selector+",mountpoint=\"/\",fstype!~\"tmpfs|overlay|squashfs\"})))"),read("LOAD","load","node_load1{"+selector+"}"),asset.gpuSupported()?read("GPU","%","avg(DCGM_FI_DEV_GPU_UTIL{"+selector+"})"):new MetricView("GPU","%",null,"UNSUPPORTED",null,null)));
    }

    @GetMapping("/assets/{assetId}/series") public MetricSeries series(Authentication auth,@PathVariable UUID assetId,@RequestParam String metric,@RequestParam(defaultValue="1h") String range){current.id(auth);AssetView asset=find(assetId);String queryMetric=metric==null?"":metric.toUpperCase();if(!asset.enabled())return new MetricSeries(assetId,queryMetric,range,"DISABLED",List.of());if(!prometheus.configured()||asset.prometheusJob()==null||asset.targetLabel()==null)return new MetricSeries(assetId,queryMetric,range,"NOT_CONFIGURED",List.of());MetricSpec spec=metricSpec(queryMetric,Boolean.TRUE.equals(asset.gpuSupported()));Duration window=switch(range){case "1h"->Duration.ofHours(1);case "6h"->Duration.ofHours(6);case "24h"->Duration.ofHours(24);default->throw new ResponseStatusException(BAD_REQUEST,"时间范围只支持 1h、6h 或 24h");};Instant end=Instant.now(),start=end.minus(window);int step=(int)Math.max(15,window.toSeconds()/120);String expression=spec.expression().formatted(escape(asset.prometheusJob()),escape(asset.targetLabel()),escape(asset.prometheusJob()),escape(asset.targetLabel()));var result=prometheus.range(expression,start,end,step);List<SeriesPoint> points=new ArrayList<>();for(var series:result.series())for(var sample:series.samples())points.add(new SeriesPoint(sample.timestamp(),sample.value(),sample.timestamp().isBefore(end.minusSeconds(staleSeconds))?"STALE":"AVAILABLE"));points.sort(java.util.Comparator.comparing(SeriesPoint::timestamp));return new MetricSeries(assetId,queryMetric,range,points.isEmpty()?"NO_DATA":"AVAILABLE",List.copyOf(points));}

    @GetMapping("/alerts") public List<AlertView> alerts(Authentication auth){current.id(auth);return jdbc.query("SELECT id,asset_id,fingerprint,state,payload,changed_at FROM alert_event ORDER BY changed_at DESC,id DESC LIMIT 100",(rs,row)->{JsonNode payload=parse(rs.getString(5));return new AlertView((UUID)rs.getObject(1),(UUID)rs.getObject(2),payload.path("alertName").asText("设备告警"),payload.path("summary").asText(""),rs.getString(4),rs.getObject(6,OffsetDateTime.class));});}

    @PostMapping("/admin/assets") @Transactional public AssetView create(Authentication auth,@Valid @RequestBody CreateAsset input){UUID actor=current.id(auth);requireAdmin(actor);validateTarget(input.prometheusJob(),input.targetLabel());UUID id=jdbc.queryForObject("INSERT INTO server_asset(name,prometheus_job,target_label,gpu_supported) VALUES (?,?,?,?) RETURNING id",UUID.class,input.name().trim(),input.prometheusJob(),input.targetLabel(),input.gpuSupported());audit(actor,"CREATE_SERVER_ASSET",id,Map.of("gpuSupported",input.gpuSupported()));return find(id);}

    @PatchMapping("/admin/assets/{assetId}") @Transactional public AssetView update(Authentication auth,@PathVariable UUID assetId,@RequestHeader("If-Match-Version") long version,@Valid @RequestBody UpdateAsset input){UUID actor=current.id(auth);requireAdmin(actor);validateTarget(input.prometheusJob(),input.targetLabel());int changed=jdbc.update("UPDATE server_asset SET name=?,prometheus_job=?,target_label=?,gpu_supported=?,enabled=?,version=version+1 WHERE id=? AND version=?",input.name().trim(),input.prometheusJob(),input.targetLabel(),input.gpuSupported(),input.enabled(),assetId,version);if(changed==0)throw new ResponseStatusException(CONFLICT,"服务器资产已变化，请刷新后重试");audit(actor,"UPDATE_SERVER_ASSET",assetId,Map.of("version",version+1,"enabled",input.enabled()));return find(assetId);}

    private MetricView read(String name,String unit,String expression){try{var result=prometheus.instant(expression);if(result.series().isEmpty()||result.series().getFirst().samples().isEmpty())return new MetricView(name,unit,null,"NO_DATA",null,null);var sample=result.series().getFirst().samples().getFirst();boolean stale=sample.timestamp().isBefore(Instant.now().minusSeconds(staleSeconds));return new MetricView(name,unit,sample.value(),stale?"STALE":"AVAILABLE",OffsetDateTime.ofInstant(sample.timestamp(),java.time.ZoneOffset.UTC),OffsetDateTime.ofInstant(sample.timestamp().plusSeconds(staleSeconds),java.time.ZoneOffset.UTC));}catch(ResponseStatusException ex){if(ex.getStatusCode().value()==503)return new MetricView(name,unit,null,"PLATFORM_UNAVAILABLE",null,null);throw ex;}}
    static boolean targetUnreachable(PrometheusClient.QueryResult up){return !up.series().isEmpty()&&!up.series().getFirst().samples().isEmpty()&&up.series().getFirst().samples().getFirst().value()==0d;}
    private List<MetricView> unavailableMetrics(String state,boolean gpu){List<MetricView> result=new ArrayList<>(List.of(new MetricView("CPU","%",null,state,null,null),new MetricView("MEMORY","%",null,state,null,null),new MetricView("DISK","%",null,state,null,null),new MetricView("LOAD","load",null,state,null,null)));result.add(new MetricView("GPU","%",null,gpu?state:"UNSUPPORTED",null,null));return List.copyOf(result);}
    private MetricSpec metricSpec(String name,boolean gpu){return switch(name){case "CPU"->new MetricSpec("100 * (1 - avg(rate(node_cpu_seconds_total{job=\"%s\",instance=\"%s\",mode=\"idle\"}[5m])))");case "MEMORY"->new MetricSpec("100 * (1 - (node_memory_MemAvailable_bytes{job=\"%s\",instance=\"%s\"} / node_memory_MemTotal_bytes{job=\"%s\",instance=\"%s\"}))");case "DISK"->new MetricSpec("100 * (1 - (node_filesystem_avail_bytes{job=\"%s\",instance=\"%s\",mountpoint=\"/\",fstype!~\"tmpfs|overlay|squashfs\"} / node_filesystem_size_bytes{job=\"%s\",instance=\"%s\",mountpoint=\"/\",fstype!~\"tmpfs|overlay|squashfs\"}))");case "LOAD"->new MetricSpec("node_load1{job=\"%s\",instance=\"%s\"}");case "GPU"->{if(!gpu)throw new ResponseStatusException(BAD_REQUEST,"该资产未声明 GPU 支持");yield new MetricSpec("avg(DCGM_FI_DEV_GPU_UTIL{job=\"%s\",instance=\"%s\"})");}default->throw new ResponseStatusException(BAD_REQUEST,"指标类型无效");};}
    private AssetView find(UUID id){return jdbc.query("SELECT id,name,prometheus_job,target_label,gpu_supported,enabled,version FROM server_asset WHERE id=?",(rs,row)->asset(rs),id).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"服务器资产不存在"));}
    private AssetView asset(java.sql.ResultSet rs)throws java.sql.SQLException{return new AssetView((UUID)rs.getObject("id"),rs.getString("name"),rs.getString("prometheus_job"),rs.getString("target_label"),Boolean.TRUE.equals(rs.getObject("gpu_supported")),rs.getBoolean("enabled"),rs.getLong("version"));}
    private void validateTarget(String job,String target){if(job!=null&&!job.matches("[A-Za-z0-9_.:-]{1,80}"))throw new ResponseStatusException(BAD_REQUEST,"Prometheus job 标签无效");if(target!=null&&!target.matches("[A-Za-z0-9_.:/-]{1,160}"))throw new ResponseStatusException(BAD_REQUEST,"目标标签无效");}
    private static String escape(String value){return value.replace("\\","\\\\").replace("\"","\\\"");}
    private void audit(UUID actor,String action,UUID id,Object value){try{jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?,'server_asset',?,?::jsonb)",actor,action,id.toString(),mapper.writeValueAsString(value));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private void requireAdmin(UUID actor){current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");}
    private JsonNode parse(String value){try{return mapper.readTree(value);}catch(Exception ex){return mapper.nullNode();}}
    private static String escapeDetail(String value){return value==null?"":value.substring(0,Math.min(value.length(),300));}

    public record AssetView(UUID id,String name,String prometheusJob,String targetLabel,Boolean gpuSupported,boolean enabled,long version){}
    public record MetricView(String metric,String unit,Double value,String status,OffsetDateTime sampledAt,OffsetDateTime expiresAt){}
    public record AssetMetrics(UUID assetId,String state,List<MetricView> metrics){}
    public record MetricSeries(UUID assetId,String metric,String range,String state,List<SeriesPoint> points){}
    public record SeriesPoint(Instant timestamp,double value,String status){}
    public record AlertView(UUID id,UUID assetId,String name,String summary,String state,OffsetDateTime changedAt){}
    public record CreateAsset(@NotBlank @Size(max=120) String name,String prometheusJob,String targetLabel,boolean gpuSupported){}
    public record UpdateAsset(@NotBlank @Size(max=120) String name,String prometheusJob,String targetLabel,boolean gpuSupported,boolean enabled){}
    private record MetricSpec(String expression){}
}
