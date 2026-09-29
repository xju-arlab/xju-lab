# OJ 成绩导入与管理员同步后端计划

[设计索引](README.md) · [考核规则](09-assessment-and-showcase.md) · [路线图](../plan/03-roadmap.md) · [决策](../plan/04-decisions-and-questions.md)

> 2026-09-29。用户要求：管理员只粘贴 OJ 页面链接即可导入算法成绩；设置实验室超级管理员时，同时为该统一账号授予 OJ 管理员。本文件为待实施后端方案，接口路径是建议；本轮没有连接生产服务、修改 OJ 角色或导入真实成绩。

## 1. 已确认的页面与计分契约

两个方向复用同一套“本次排名 / 历史排名”切换控件，默认本次排名，切换方向时保留排行视图。

| 方向 | 本次排名 | 历史排名 |
|---|---|---|
| ACM 算法 | 按本场 AC 数降序、罚时升序，展示逐题结果 | 历史百分位排名分均值 × 25% + 本次排名分 × 75% |
| 深度学习理论基础 | 仅按本场 0–100 分成绩降序，展示本场评分项，同分并列 | 同培养期此前笔试/机试有效成绩均值 × 25% + 本次成绩 × 75% |

“历史排名”是截至所选场次的加权综合排行，仍包含本次 75%；不是只对历史均值排名。成绩响应同时提供 `currentRank`、`overallRank`、本次分、历史均分、有效场次/总场次和算法版本。搜索、分页不能改变全榜名次；切换两种视图改变排序和列，但不改变计分口径。

每场理论考试只有一个 `kind`：`written` 或 `practical`。数据库字段 `NOT NULL` 且 `CHECK (kind IN ('written','practical'))`，API 单值枚举，拒绝数组、空值、`both` 和双布尔标记。创建时必选一种；已有成绩后不得直接改类型，需修订/新建场次，避免改写已发布量规。学生成绩不另设一个可覆盖场次类型的字段。两种形式混合出现在培养期历史中，**不表示同一场同时采用两种形式**。

## 2. OJ 源码盘点

只读检查了同级 `../xju-oj/` 当前工作区，未修改。以下是已存在的行为，不等于新增集成能力已经可用：

- `backend/contest/urls/oj.py` 和 `views/oj.py` 已提供 `/api/contest_rank`，使用分页，ACM 按 `accepted_number`、`total_time` 排序，存在管理员刷新和导出逻辑。
- `backend/account/models.py` 已有 `Regular User`、`Admin`、`Super Admin`，以及稳定的 `studio_account_id`、`ExternalIdentity(issuer, subject)`。
- `backend/account/oidc.py::_apply_admin_claims` 当前把 `icthub-admins` 映射为 OJ `Super Admin`，不在该组则覆盖为普通用户；`tests_oidc_contract.py` 对此有测试。单次更新 `admin_type` 会被之后的 OIDC 登录重置。
- `User.is_contest_admin` 当前仅认可比赛创建者或 OJ 超级管理员，普通 `Admin` 不自动具备所有比赛的管理权。因此不能假定授予普通管理员后就能无条件读取任意私有/封榜比赛。
- `/api/admin/user` 是面向人工管理员的广泛账户修改接口，需要超级管理员；不直接拿浏览器会话、密码或管理员 Cookie 充当后端服务凭据。

## 3. 管理员粘贴链接导入

### 3.1 用户操作与接口

ACM 页点击“导入成绩”，弹窗只有 **OJ 比赛链接** 一个必填输入。接受 `https://oj.icthub.top/contest/{id}` 和 `.../{id}/rank`，尾斜线及排行榜分页 query 可被归一化为同一比赛。导入整场数据，不只导入链接指定的那一页。培养期由当前实验室已配置的活动培养期确定；页面可只读展示培养期，无需每次另填文件或账号凭据。若无活动培养期、比赛日期与培养期不符或身份映射不完整，明确显示原因并引导到对应设置。

| 建议 LabOS 接口 | 请求/响应重点 | 权限 |
|---|---|---|
| `POST /api/v1/assessment/acm/imports` | `{ "sourceUrl": "https://oj.icthub.top/contest/13/rank" }`；`Idempotency-Key`；返回 202 和 `importId/status/contestId/termId` | 活跃 LAB_ADMIN / SUPER_ADMIN |
| `GET /api/v1/assessment/acm/imports/{importId}` | 阶段、人数、映射问题、已有版本/新版本、错误码、可否重试 | 授权管理员，校验实验室归属 |
| `GET /api/v1/assessment/acm/contests/{contestId}/ranking?view=current\|history&excludeVeterans=true` | 全量数据计算后的分页排行；源快照与算法版本 | 现有考核读取权限 |

重复点击使用同一幂等键；明确重试可生成新键，但依然对同一源比赛做业务去重。管理员身份从有效服务端会话获取；前端按钮可见性不是授权。导入是后台任务，关闭页面不取消，重新打开可查看实际状态。成功后自动切到该场比赛并刷新两类排行。当前原型只检查链接，显示“服务尚未接入、尚未导入”，不生成假的成功或成绩。

### 3.2 URL 和源访问

服务端重新解析 URL，只允许已配置 OJ origin 的 HTTPS 和明确比赛路径，拒绝用户信息、非默认端口、非法/溢出 ID 及其他站点；query/hash 不作为服务端请求参数。提取 ID 后，通过**配置好的 OJ 连接器地址**构建固定 API 请求，不直接抓取用户传入地址，不提供通用 URL 代理，也不跟随跨源重定向。来源凭据仅在服务端保存并从日志脱敏。

OJ 侧建议增加具备服务身份校验的只读接口 `GET /api/integrations/labos/contests/{contestId}/results`，返回比赛元数据、规则类型、最终榜单标志、源快照版本、完整总人数和可分页的数据。此接口尚不存在，须与 OJ 项目共同实现。服务账户仅允许读取获准接入 LabOS 的比赛；不具有题目修改、判题管理或账户角色修改权限。角色同步使用另一项授权范围。

只导入已结束、已解封且可获得最终榜单的 ACM 比赛；未开始、进行中、封榜、OI、无访问权限均返回明确状态/错误，不当成零成绩。普通管理员能在 LabOS 发起导入，但源比赛必须在连接器获准范围内，不能因 UI 有按钮而绕过 OJ 权限。

### 3.3 后台流程与完整性

```text
QUEUED → FETCHING → VALIDATING → RECOMPUTING → COMPLETED
                       ├→ WAITING_MAPPING → 管理员完成映射后重试
                       ├→ NO_CHANGE（数据与当前版本相同）
                       └→ FAILED（保留明确错误，旧榜单不变）
```

1. 校验管理员权限、培养期与源比赛，登记任务和审计记录。
2. 拉取完整榜单，在暂存区按 `sourceUserId` 去重，检查分页总数、题目列、数值、规则类型及同一源快照版本。发现中途重判/版本变化则整次重试，不能把不同时点分页拼成最终成绩。
3. 通过已验证的 `studio_account_id` 关联 LabOS 成员；保留源 OJ user ID 与 `iss + sub` 的身份映射，不按昵称或邮箱自动合并。重复/冲突/缺失映射显示明细，不静默丢弃影响排名的记录。实验室外成员由明确资格规则排除并统计原因；待认领的潜在实验室成员进入 WAITING_MAPPING。
4. 原始快照保留源 rank、AC、提交数、罚时秒、逐题状态、首解、源人数；LabOS 榜单只在培养期有效成员范围内计算。老成员标记来自 LabOS 的培养期成员分组，先过滤再计算各场 N 和名次。首次导入前先建立完整成员与培养期资格基线。
5. 全部校验完成后，在同一本地事务写入快照、成员成绩、审计和重算事件；不边翻页边修改可见排名。完整性失败时不发布部分成绩，也不清空旧快照。
6. `(sourceSystem, sourceContestId)` 唯一标识源比赛；相同数据哈希返回 NO_CHANGE。重判后的不同内容生成新快照版本，触发该培养期所选场及之后场次的历史综合重算；已发布结果生成待审核新版本，不静默覆盖。

建议新增 `assessment_import_job`、`oj_contest_snapshot`、`oj_result_snapshot`、`member_external_identity`；记录 actor、sourceId、termId、sourceVersion、内容 hash、映射报告、时间、状态和失败原因。保留稳定版本供回溯；实际保留期跟随 Q09，不擅自设为永久。

## 4. 实验室超级管理员 → OJ 管理员

### 4.1 授权来源与角色级别

本项目将“实验室超级管理员”对应到现有 `SUPER_ADMIN` 角色。赋予此角色时自动创建 OJ 管理员授权；撤销/停用时自动移除此来源。默认映射为 OJ **`Admin`**，`problem_permission=Own`，符合“设置 OJ 管理员”的字面要求；OJ `Super Admin` 是更高一级，仍保留给独立授权来源。若后续确需全站超级权限，需要单独明确角色级别，不能通过加入全局 `icthub-admins` 组间接扩大其他产品权限。

建议 OJ 引入外部角色授权表 `external_role_grant`，键为 `(sourceSystem, issuer, subject, scope)`，保存稳定账户 ID、来源版本、启停状态和操作者引用。统一角色解析器在 OIDC 登录、同步更新和权限检查时合并有效来源：

```text
全局可信管理员来源/独立 OJ Super Admin 授权 → Super Admin
否则，有效 LabOS SUPER_ADMIN 来源/独立 OJ Admin 授权 → Admin
否则 → Regular User
```

因此必须改造 OJ `_apply_admin_claims` 的覆盖式逻辑，不能只调用当前用户编辑接口。撤销 LabOS 来源只删除这一来源，不能降级仍有独立来源的管理员。接入前盘点现有本地账户与旧角色，显式迁移可证明的独立授权来源；不能把历史遗留的 `admin_type` 一律当永久授权，否则会留住应被撤销的权限。全局组来源保留现有登录校验语义，不能与缓存的陈旧组互相覆盖。

### 4.2 同步事务与失败恢复

| 建议接口 | 职责 |
|---|---|
| LabOS `PUT /api/v1/admin/members/{memberId}/roles` | 由现有 SUPER_ADMIN 修改角色，写本地角色、审计和 outbox，返回本地保存状态及 OJ 同步状态 |
| LabOS `GET /api/v1/admin/members/{memberId}/oj-role-sync` | 返回期望角色、确认角色、版本、最后成功时间和错误 |
| LabOS `POST /api/v1/admin/members/{memberId}/oj-role-sync/retry` | 授权管理员重试最新期望状态，禁止重新发送旧授权 |
| OJ `PUT /api/integrations/labos/role-grants/{accountId}` | 新增服务端受限接口，仅更新 LabOS 来源授权，支持 enable/disable、eventId 和递增版本；尚未实现 |

角色保存本地事务同时写审计和 outbox，提交后立即触发 worker 同步。只有收到 OJ 确认才显示“已同步”；之前显示“待同步/同步失败”，本地设置成功不冒充跨系统成功。发消息前再读最新本地期望状态，接收端只接受新版本并按 eventId 幂等。乱序、重复、重试不能把已撤销权限重新授予。

使用验证后的稳定账户 ID 与 issuer/subject 定位同一人。目标尚未在 OJ 建立账户则显示 WAITING_IDENTITY；在首次可信 OIDC 建档时重新对账应用授权，不凭邮箱创建或合并账户。启用、取消 SUPER_ADMIN、停用成员均触发同步；不得允许客户端给自己升权，首次管理员按 A0 独立引导。

OJ 权限收敛必须让已有会话在下一次受保护请求读取新的有效权限，或通过权限版本失效会话/缓存；不能只等下一次登录。撤销优先重试，超过阈值告警；授权记录采用可续期的有限租期，长期失联时不无限保留 LabOS 来源高权限。租期、重试退避与告警阈值在联调时冻结。定期对账补齐丢失事件，防止两个系统长期不同步。

服务身份用独立 audience 与有限 scope（例如 `contest.results.read` / `labos.role-grant.write`），短期凭据或 mTLS 由运维选定；浏览器不持有服务凭据。角色写接口不能修改密码、全局组、其他授权来源或授予超过约定 `Admin` 的权限，完整记录双边审计与关联 ID。

## 5. 分步实施与验收

| 步骤 | 实施 | 必须验证 |
|---|---|---|
| OJ-01 | 冻结稳定身份映射、来源角色表、服务身份和权限契约 | 同人跨系统可定位；邮箱重名、OIDC 冲突拒绝 |
| OJ-02 | OJ 角色合并器、受限授权接口；LabOS outbox/同步状态 | 新授予、取消、停用、重登录、旧会话、无 OJ 账户、重复/乱序、独立授权保留 |
| OJ-03 | OJ 最终榜单读取接口及 LabOS 链接导入任务 | URL 白名单、私有赛授权、ACM/OI、封榜、完整分页、源版本一致、映射冲突、重试幂等 |
| OJ-04 | 考核快照和两个方向的两种排行 API | 本次排行不受历史影响；25% / 75%；过滤后全历史重算；笔试/机试单值约束 |
| OJ-05 | 前端真实接入、审计和故障演练 | 一个链接成功导入；任务可追踪；失败不改旧榜；角色同步失败不假成功 |

OJ-02/03 需要对 `xju-oj` 的正式协同改动，不能只在 LabOS 单仓声称完成。本轮只更新计划和前端交互，后端、身份组、部署配置与生产权限均尚未修改。
