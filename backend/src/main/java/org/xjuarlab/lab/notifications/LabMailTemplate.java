package org.xjuarlab.lab.notifications;

import org.springframework.web.util.HtmlUtils;

public final class LabMailTemplate {
    private LabMailTemplate() {}
    public record Content(String text, String html) {}
    public static Content render(String origin, String title, String recipient, String body, String summary, String link, boolean approval) {
        String action = approval ? "查看并审批申请" : "查看申请";
        String note = approval ? "无需登录，打开申请后确认一次即可。链接 72 小时内有效，请勿转发。打开邮件或链接不会自动审批。" : "请登录实验室平台查看详情。";
        String text = "您好 " + recipient + "：\n\n" + body + "\n\n" + summary + "\n\n" + action + "：" + link + "\n\n" + note + "\n\n算法与科研实验室";
        String html = """
            <!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;background:#f7f6f3;color:#37352f;font-family:Arial,'Microsoft YaHei',sans-serif">
            <table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%%;max-width:560px;background:#fff;border:1px solid #e8e6e1;border-radius:12px"><tr><td style="padding:32px">
            <img src="%s/brand/lab-seal.png" alt="算法与科研实验室" width="56" height="56" style="display:block;width:56px;height:auto;border:0">
            <h1 style="font-family:Georgia,'Songti SC',serif;font-size:24px;line-height:1.5;margin:24px 0 16px">%s</h1>
            <p style="line-height:1.8">您好 %s：</p><p style="line-height:1.8">%s</p>
            <p style="line-height:1.8;white-space:pre-line">%s</p>
            <p style="margin:28px 0"><a href="%s" style="display:inline-block;padding:13px 22px;background:#3d655d;color:#fff;text-decoration:none;border-radius:7px">%s</a></p>
            <p style="font-size:13px;line-height:1.8;color:#78766f">%s</p>
            <div style="border-top:1px solid #eeede9;margin-top:28px;padding-top:24px"><img src="%s/brand/lab-wide.png" alt="XJU Algorithm &amp; Research Lab" width="300" style="display:block;width:100%%;max-width:300px;height:auto;border:0"></div>
            </td></tr></table></td></tr></table></body></html>
            """.formatted(escape(origin), escape(title), escape(recipient), escape(body), escape(summary), escape(link), escape(action), escape(note), escape(origin));
        return new Content(text, html);
    }
    private static String escape(String value) { return HtmlUtils.htmlEscape(value == null ? "" : value, "UTF-8"); }
}
