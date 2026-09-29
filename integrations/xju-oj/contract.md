# OJ → LabOS 双系统接口契约

以下是 `backend/src/main/java/org/xjuarlab/lab/integrations/oj/OjIntegrationClient.java` 当前实现所要求的固定接口。两端以受限服务 token 鉴权；token 仅由服务端持有。必须使用 HTTPS、精确 allowlist、请求超时与不跟随跨源重定向。不得把比赛链接转交成任意 URL 请求。

## 1. 读取最终比赛榜单

`GET /api/integrations/labos/contests/{contestId}/results?limit=500&offset=0`

只允许服务账户读取已结束、已解封的最终 ACM 排行。每页返回同一不可变榜单快照的版本标识；一旦比赛重判或快照在分页期间变化，OJ 必须返回新版本，LabOS 会中止导入并保留旧榜。`contestId` 为仅数字的源比赛 ID。所有分页元数据（标题、结束时间、规则、总人数、两个版本和最终榜标记）必须一致。

```json
{
  "contestId": "123",
  "title": "公开算法赛",
  "ruleType": "ACM",
  "endedAt": "2026-09-28T16:00:00+08:00",
  "sourceVersion": "contest-row-version-7",
  "snapshotVersion": "rank-2026-09-28-final-2",
  "finalRanking": true,
  "total": 1,
  "items": [
    {
      "sourceUserId": "507",
      "accountId": "12345678",
      "rank": "1",
      "acceptedCount": 5,
      "penaltySeconds": 4320
    }
  ]
}
```

字段要求：`accountId` 是已验证的稳定八位账户 ID，不是昵称、邮箱或页面提交字段；`rank` 可用十进制字符串表示并列平均名次；`acceptedCount` 为 0–200 整数；`penaltySeconds` 为非负整数。`sourceUserId` 在该比赛内稳定且不能重复。分页 `items` 最多 500 项；`total` 是源榜完整人数。LabOS 当前用于计分的字段为比赛 ID、标题、规则、结束时间、版本、总人数及每行的上述字段。

封榜、未结束、OI、访问拒绝、版本变化、缺页、重复源用户、非法账户映射或格式错误必须返回明确非 2xx/错误码；不可返回看似成功的空榜。跨页异常由 LabOS 作为失败处理，已有成绩不变。

## 2. LabOS 来源的 OJ Admin 授权

`PUT /api/integrations/labos/role-grants/{accountId}`

请求示例：

```json
{
  "eventId": "b6b0d244-06af-47e3-8a13-f6a2ce3541ae",
  "version": 12,
  "enabled": true,
  "source": "xju-lab",
  "role": "Admin",
  "problemPermission": "Own"
}
```

`accountId` 必须已经在 OJ 可信账户映射中存在，不能按邮箱创建或关联。`eventId` 全局幂等；相同事件重试应返回相同结果。仅接受严格递增的 `version`；旧版本请求不得覆盖新状态。`enabled=false` 只撤销 `source=xju-lab` 这一来源，不得删除人工 OJ 管理授权或其他集成来源。该来源角色是 OJ `Admin` / `Own`，不能隐式提升到 `Super Admin`。

成功响应：

```json
{"accepted":true,"acceptedVersion":12,"enabled":true}
```

权限检查必须合并独立授权来源，并让现有会话在下一次受保护请求或权限版本刷新时反映撤销。接口不可接受浏览器用户 token、OJ 用户 Cookie 或 LabOS 页面传来的操作者身份；调用审计应记录服务账户、来源、事件和版本，不记录 token。未映射账户返回可重试/待建档错误，不能按昵称猜测。
