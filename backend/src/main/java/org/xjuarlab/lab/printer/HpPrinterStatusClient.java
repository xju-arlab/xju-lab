package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Component;

/** A fixed, read-only source. No user-supplied URL, redirect or print operation. */
@Component
public class HpPrinterStatusClient {
    public static final URI ENDPOINT = URI.create("https://hp.icthub.top/v1/status");
    private final ObjectMapper mapper;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
    public HpPrinterStatusClient(ObjectMapper mapper) { this.mapper=mapper; }

    public Snapshot fetch() {
        try {
            var request=HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(6)).header("Accept","application/json").header("User-Agent","XJU-Lab-Printer-Status/1.0").GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofByteArray());
            if(response.statusCode()!=200 || response.body().length>262144) throw new IllegalArgumentException();
            return decode(mapper.readTree(response.body()));
        } catch(InterruptedException ex) { Thread.currentThread().interrupt(); throw new IllegalStateException("Printer status unavailable"); }
        catch(Exception ex) { throw new IllegalStateException("Printer status unavailable"); }
    }

    Snapshot decode(JsonNode root) {
        if(root==null || !root.isObject() || !root.path("schemaVersion").isIntegralNumber() || root.path("schemaVersion").asInt()!=1 || !root.path("online").isBoolean() || !root.path("stale").isBoolean()) throw new IllegalArgumentException("Invalid printer status schema");
        String name=text(root,"printerName",120,"");
        if(name.isBlank()) throw new IllegalArgumentException("Printer name missing");
        OffsetDateTime observed=root.path("observedAt").isTextual()?OffsetDateTime.parse(root.path("observedAt").asText()):null;
        ObjectNode report=mapper.createObjectNode();
        report.put("agentVersion","hp-status-v1").put("sourceAvailable",true).put("online",root.path("online").asBoolean()).put("stale",root.path("stale").asBoolean());
        report.put("model",text(root,"model",160,"型号未知"));
        String state=root.path("state").asText("unknown");
        String deviceState=switch(state){case "idle"->"READY";case "processing","printing"->"BUSY";case "stopped","error"->"ERROR";default->"UNKNOWN";};
        if(root.path("paperEmpty").asBoolean()) deviceState="PAPER_OUT";
        report.put("deviceState",deviceState).put("stateLabel",text(root,"stateLabel",80,"状态未知"));
        report.put("paperLabel",text(root,"paperLabel",80,"纸张状态未知")).put("paperEmpty",root.path("paperEmpty").asBoolean()).put("paperLow",root.path("paperLow").asBoolean());
        report.put("paperReportsDiffer",root.path("paperReportsDiffer").asBoolean());
        report.put("devicePaperLabel",text(root.path("device"),"paperLabel",80,"未知")).put("queuePaperLabel",text(root.path("queue"),"paperLabel",80,"未知"));
        report.put("suppliesApproximate",root.path("suppliesApproximate").asBoolean(true));
        var supplies=report.putArray("supplies");
        if(root.path("supplies").isArray()) {
            for(JsonNode item:root.path("supplies")) {
                if(supplies.size()>=8) break;
                var supply=supplies.addObject().put("name",text(item,"name",80,"耗材")).put("low",item.path("low").asBoolean());
                JsonNode level=item.path("levelPercent");
                if(level.isNumber() && Double.isFinite(level.asDouble()) && level.asDouble()>=0 && level.asDouble()<=100) supply.put("levelPercent",level.asDouble());
                else supply.putNull("levelPercent");
            }
        }
        // Ink cartridges remain separate; do not invent a combined toner percentage.
        report.put("tonerSupported",false).putNull("tonerPercent").put("reportedAt",OffsetDateTime.now().toString());
        return new Snapshot(name,observed,report);
    }
    private static String text(JsonNode node,String field,int max,String fallback) {
        String value=node.path(field).isTextual()?node.path(field).asText().trim():fallback;
        return value.length()>max?value.substring(0,max):value;
    }
    public record Snapshot(String name,OffsetDateTime observedAt,ObjectNode report) {}
}
