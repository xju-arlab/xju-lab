package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HpPrinterStatusClientTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final HpPrinterStatusClient client=new HpPrinterStatusClient(mapper);
    private ObjectNode fixture() throws Exception {
        return (ObjectNode)mapper.readTree("""
            {"schemaVersion":1,"printerName":"测试设备","model":"Test DeskJet","online":true,"stale":false,
             "observedAt":"2030-01-01T00:00:00Z","state":"idle","stateLabel":"空闲","paperLabel":"未报告缺纸",
             "suppliesApproximate":true,"paperReportsDiffer":true,"device":{"paperLabel":"未报告缺纸"},
             "queue":{"paperLabel":"缺纸","jobs":[{"owner":"private"}]},"secret":"private",
             "supplies":[{"name":"彩色墨盒","levelPercent":27,"low":false},{"name":"黑色墨盒","levelPercent":63,"low":false}]}
            """);
    }
    @Test void keepsDeviceFieldsAndSeparateEstimatedCartridgesWithoutQueueDetails() throws Exception {
        var result=client.decode(fixture());
        assertThat(result.name()).isEqualTo("测试设备");
        assertThat(result.observedAt().toString()).isEqualTo("2030-01-01T00:00Z");
        var report=result.report();
        assertThat(report.path("model").asText()).isEqualTo("Test DeskJet");
        assertThat(report.path("deviceState").asText()).isEqualTo("READY");
        assertThat(report.path("supplies").size()).isEqualTo(2);
        assertThat(report.path("supplies").get(0).path("levelPercent").asDouble()).isEqualTo(27);
        assertThat(report.path("supplies").get(1).path("levelPercent").asDouble()).isEqualTo(63);
        assertThat(report.path("paperLabel").asText()).isEqualTo("未报告缺纸");
        assertThat(report.path("paperReportsDiffer").asBoolean()).isTrue();
        assertThat(report.path("queuePaperLabel").asText()).isEqualTo("缺纸");
        assertThat(report.path("suppliesApproximate").asBoolean()).isTrue();
        assertThat(report.path("tonerPercent").isNull()).isTrue();
        assertThat(report.toString()).doesNotContain("secret","private","jobs");
    }
    @Test void unknownAndInvalidLevelsNeverBecomeZeroAndProjectionIsBounded() throws Exception {
        var root=fixture(); var supplies=root.putArray("supplies");
        supplies.addObject().put("name","无读数");
        supplies.addObject().put("levelPercent",-1);
        supplies.addObject().put("levelPercent",101);
        supplies.addObject().put("levelPercent","40");
        supplies.addObject().put("levelPercent",0);
        supplies.addObject().put("levelPercent",100);
        for(int i=0;i<10;i++) supplies.addObject().put("name","x".repeat(100));
        root.put("paperEmpty",true).put("printerName","x".repeat(150));
        var result=client.decode(root); var projected=result.report().path("supplies");
        assertThat(projected.size()).isEqualTo(8);
        for(int i=0;i<4;i++) assertThat(projected.get(i).path("levelPercent").isNull()).isTrue();
        assertThat(projected.get(4).path("levelPercent").asInt()).isZero();
        assertThat(projected.get(5).path("levelPercent").asInt()).isEqualTo(100);
        assertThat(projected.get(6).path("name").asText()).hasSize(80);
        assertThat(result.name()).hasSize(120);
        assertThat(result.report().path("deviceState").asText()).isEqualTo("PAPER_OUT");
    }
    @Test void rejectsMissingIdentityAndUnrecognizedSchemas() throws Exception {
        var root=fixture(); root.put("schemaVersion",2);
        assertThatThrownBy(()->client.decode(root)).isInstanceOf(IllegalArgumentException.class);
        root.put("schemaVersion",1).put("online","true");
        assertThatThrownBy(()->client.decode(root)).isInstanceOf(IllegalArgumentException.class);
        root.put("online",true).put("printerName"," ");
        assertThatThrownBy(()->client.decode(root)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->client.decode(null)).isInstanceOf(IllegalArgumentException.class);
    }
}
