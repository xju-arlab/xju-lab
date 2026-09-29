# 外部集成状态

更新时间：2026-09-29。此表区分本仓实现、受控本地验证和必须由真实系统/人员/设备完成的联调。不得用模拟返回值替代生产验收。

| 系统 | 本仓状态 | 已有本地证据 | 仍需完成 |
|---|---|---|---|
| PostgreSQL / Redis | 完成服务配置、Flyway 迁移、会话/业务存储 | GitHub Actions 对 PostgreSQL 17.6、Redis 7.4.3 和 RustFS 执行 Testcontainers；6 个迁移、28 项后端测试及 Compose 配置检查通过 | 生产容量和备份恢复演练 |
| 身份提供方 | OIDC 会话、`iss + sub` 映射、角色和本地 Keycloak realm 已实现 | 合成 OIDC principal / MockMvc 权限测试；尚未验证本地 Keycloak 浏览器登录闭环 | 生产 Authentik issuer/client/准入组、首位管理员精确 subject、至少两名真实用户隔离/撤权/CSRF 验收 |
| 成员名册 | 管理员目录、角色/停用/映射接口和前端页已实现 | 后端目录/权限相关集成用例 | 实际名单、学号/可信账户映射、导师关系的安全导入与人工核验；当前没有真实成员资料 |
| 私有文件与对象存储 | S3 兼容私有对象接口、服务端文件校验和授权下载已实现 | RustFS 1.0.0 Testcontainers 集成用例通过 | 生产 bucket、TLS、最小权限凭据、生命周期和完整数据库/对象一致性恢复演练 |
| SMTP / 通知 | 数据库 outbox、失败重试、Mailpit Compose 配置已实现 | Outbox 失败路径与持久事件用例；未验证生产投递 | Mailpit 成功收件端到端、真实 sender/收件人、退信/限流/告警及真实审批通知确认 |
| 打印服务与 CUPS | 持久队列、设备凭据、租约/fencing、Python Agent、CUPS/IPP 适配已实现 | Python 3.12 单测 5/5；隔离本地 CUPS daemon + `ippeveprinter` 收到 PDF，CUPS `COMPLETED`；临时队列已移除，原有队列保留 | Raspberry Pi 安装、真实型号/驱动、A4/双面/彩色能力与实物试打、断网/重启故障演练 |
| Prometheus / exporters | 固定查询后端、资产映射、过期/缺失处理和告警去重已实现 | 2 个 client 测试 + 监控状态单测；未启动真实 Prometheus 抓取节点 | 生产 Prometheus origin/token、固定标签核对、真实 CPU/GPU exporter（含实际 GPU 数据）和告警恢复 |
| XJU OJ | LabOS 单链接导入任务、结果固定 URL 连接器、角色 outbox/版本确认已实现；接口要求见 [`../integrations/xju-oj/contract.md`](../integrations/xju-oj/contract.md) | 本地连接器响应/错误测试和导入任务持久化用例；没有真实 OJ 服务请求 | 目标 OJ 端受限成绩接口、按来源隔离授权表、旧登录覆盖逻辑修复、服务 token、真实映射/分页/重判/乱序撤销联调 |
| 网络、域名和生产部署 | Compose、Nginx、环境示例、容器安全设置和 Prometheus 模板已创建 | `docker compose --env-file .env.example -f deploy/compose.yaml config --quiet` 通过；Windows Docker Desktop engine 当前不可用，未启动容器 | 目标环境、DNS/TLS/反向代理、外部访问策略、资源预算、部署/回退演练；本轮未发布生产 |
| 备份/灾备 | PostgreSQL + 私有 S3 同步脚本和操作说明已创建 | 本地脚本尚未在隔离数据库及 bucket 执行，因此不算通过 | 维护窗口一致快照、dump 与对象清单校验、空数据库/空 bucket 恢复、应用健康与关联完整性、保留/异地策略 |

## 完成判定

- **已完成本地实现**不代表连接了生产系统。当前没有生产 OIDC、SMTP、对象存储、Prometheus、OJ、打印设备或域名的凭据/目标配置。
- OJ 的目标工作区版本在只读盘点记录为 `f6b1cda3efcffce5a10a310762cfd1c6c268bb8f`。本仓交付的是连接器与精确契约；没有修改 `../xju-oj/`，也没有生成或声称验证了 OJ 源码补丁。
- 生产备份/恢复、真实性能基准与生产上线未执行。部署前还需在指定环境完成目标配置、回退演练与授权审批。
