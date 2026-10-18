package com.fitlog.content;

import com.fitlog.common.M;

import java.util.List;
import java.util.Map;

public final class Legal {
    private Legal() {}

    public static Map<String, Object> privacyPolicy() {
        return M.of()
                .put("version", "1.0")
                .put("updatedAt", "2026-10-18")
                .put("title", "练迹 FitLog 隐私政策与用户协议（摘要）")
                .put("summary", "我们只采集提供服务所必需的信息：手机号或微信标识用于登录，训练、打卡、身体数据与内容用于向你展示记录与统计。")
                .put("sections", List.of(
                        M.of().put("title", "我们采集什么").put("body", "手机号或微信 openid（登录凭证）、昵称与头像（可跳过）、训练记录与组数据、打卡记录、你主动填写的身体数据、你上传的图片与视频、你对内容可见性的设置。不采集身份证、精确位置与通讯录。"),
                        M.of().put("title", "用途与边界").put("body", "上述信息仅用于登录、记录、统计、内容展示与你主动开启的提醒。统计结果只呈现你自己的数据，不提供健康或医疗结论。"),
                        M.of().put("title", "存储与保留").put("body", "媒体文件私有存储，通过有效期 2 小时的签名链接访问。删除内容后 24 小时内释放计费用量；账号注销满 30 天后彻底删除，包括媒体原件与转码产物。"),
                        M.of().put("title", "第三方共享").put("body", "为完成上传、加速与内容审核，可能使用对象存储、CDN 与内容安全服务，仅传输完成该能力所必需的数据。不向第三方出售你的数据。"),
                        M.of().put("title", "你的权利").put("body", "你可以随时修改可见性、导出全部数据（CSV + JSON）、关闭提醒、申请注销并在 30 天内撤销。"),
                        M.of().put("title", "未成年人保护").put("body", "本产品不设置付费与打榜，不展示减肥/增肌效果承诺。未成年用户应在监护人指导下使用，并可申请开启青少年模式提示。")
                ));
    }

    public static Map<String, Object> reviewPolicy() {
        return M.of()
                .put("title", "内容审核机制说明")
                .put("updatedAt", "2026-10-18")
                .put("chain", "发布 → 机审（文本 + 图片/视频）→ 命中高危直接拦截；疑似转人审；未命中先仅自己可见 → 人审通过后公开")
                .put("sla", List.of("机审在发布请求内同步完成，P95 ≤3 秒", "高危内容 15 分钟内人工响应", "常规人审 T+24 小时，抽检率 ≥20%", "举报 24 小时内响应、48 小时内结论", "申诉 48 小时内答复"))
                .put("quota", "公开内容每日 20 条全站名额，超出自动转仅自己可见并顺延次日。");
    }
}
