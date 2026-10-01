package org.xjuarlab.lab;

import org.junit.jupiter.api.Test;
import org.xjuarlab.lab.notifications.LabMailTemplate;
import static org.assertj.core.api.Assertions.assertThat;

class LabMailTemplateTest {
    @Test void senderParsesConfiguredDisplayNamesBeforeApplyingLabBrand() throws Exception {
        for(String configured:java.util.List.of("notice@example.test","ICTHub <notice@example.test>","旧名称 <notice@example.test>")) {
            var sender=LabMailTemplate.sender(configured);
            assertThat(sender.getAddress()).isEqualTo("notice@example.test");
            assertThat(sender.getPersonal()).isEqualTo("算法与科研实验室");
            sender.validate();
        }
        org.assertj.core.api.Assertions.assertThatThrownBy(()->LabMailTemplate.sender("one@example.test,two@example.test")).isInstanceOf(jakarta.mail.internet.AddressException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->LabMailTemplate.sender("team:one@example.test;")).isInstanceOf(jakarta.mail.internet.AddressException.class);
    }
    @Test void brandedMailEscapesUserInputAndProvidesPlainTextWithoutAutoSubmission() {
        var mail=LabMailTemplate.render("https://lab.example.invalid","审批通知","<script>姓名</script>","待审批","时间 & 姓名","https://lab.example.invalid/app/leave/email-action#token=fixture",true);
        assertThat(mail.html()).contains("&lt;script&gt;", "时间 &amp; 姓名", "/brand/lab-seal.png", "/brand/lab-wide.png", "max-width:300px", "height:auto", "无需登录").doesNotContain("<script>","<form", "onload=");
        assertThat(mail.text()).contains("审批", "请勿转发", "#token=fixture");
    }
}
