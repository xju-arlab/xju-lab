# 外部集成状态

更新时间：2026-09-30。此表区分本仓实现、CI 隔离环境验证和必须由真实系统/人员/设备完成的联调。不得用合成身份或受控服务替代生产验收。

| 系统 | 本仓状态 | 已有受控验证证据 | 仍需完成 |
|---|---|---|---|
| PostgreSQL / Redis | 完成服务配置、Flyway 迁移、会话/业务存储 | GitHub Actions 启动 PostgreSQL 17.6、Redis 7.4.3、RustFS；6 个迁移、后端集成测试和 Compose 配置检查通过。隔离恢复 job 验证探针行及关联对象字节 | 生产容量、完整应用库恢复、RTO/RPO 与异地灾备 |
| 身份提供方 | OIDC 会话仍以 `iss + sub` 映射；Lab 开放自助注册仅接受邮箱已验证的精确 `@icthub.top`，新成员仅获 MEMBER。Lab/OJ 为同级应用，角色产品隔离，既有超级管理员来源同步规则保留 | 新增了邮箱域名拒绝/接受、成员准入权限、实名注册/业务 API 门禁和资料更新测试；本轮 CI 待运行 | 生产 Authentik issuer/client、自助注册和验证邮件策略、确保返回 `email_verified=true`，首位管理员确切 subject，真实用户隔离/撤权/CSRF 验收 |
| 成员名册 | 增加一次性真实姓名/学号登记、唯一学号约束、本人班级/方向更新、班级派生年级和仅 SUPER_ADMIN 修改实名字段；姓名不从 OIDC 昵称推断 | 新增 PostgreSQL 注册 API 集成测试与班级格式单测；本轮 CI 待运行 | 真实成员资料逐人核对；班级简称/年级约定确认；SUPER_ADMIN 审计更正流程实测 |
| 对象存储 | S3 兼容对象存储用于数据库备份/恢复演练；打印 PDF 上传和私有文件 API 已删除 | 隔离恢复检查备份对象 key/字节与目标桶陈旧对象清理 | 生产备份 bucket、TLS、最小权限凭据、生命周期和完整业务数据库/对象一致性恢复演练 |
| SMTP / 通知 | 数据库 outbox、失败重试、Mailpit Compose 配置已实现 | CI 审批流程验证数据库通知创建和用户标记已读；outbox 失败路径与持久事件用例通过 | 真实 SMTP sender/收件人、成功投递、退信/限流/告警及邮件端到端确认 |
| 打印机状态 | 打印页、PDF 文件 API、能力配置、打印队列和 Agent 派发/执行逻辑已删除；保留设备登记、凭据轮换、只读 CUPS 状态采集和心跳 | 本轮新增状态专用协议与前端展示检查；真实设备与 huawei2 Agent 尚未联调 | huawei2 上安装 status-only Agent，确认设备/CUPS 状态映射与耗材支持字段；此项目不执行打印 |
| Prometheus / exporters | 固定查询后端、资产映射、过期/缺失处理和告警去重已实现 | 2 个 client 测试 + 监控状态单测；未启动真实 Prometheus 抓取节点 | 生产 Prometheus origin/token、固定标签核对、真实 CPU/GPU exporter（含实际 GPU 数据）和告警恢复 |
| XJU OJ | LabOS 单链接导入任务、结果固定 URL 连接器、角色 outbox/版本确认已实现；接口要求见 [`../integrations/xju-oj/contract.md`](../integrations/xju-oj/contract.md) | 本地连接器响应/错误测试和导入任务持久化用例；没有真实 OJ 服务请求 | 目标 OJ 端受限成绩接口、按来源隔离授权表、旧登录覆盖逻辑修复、服务 token、真实映射/分页/重判/乱序撤销联调 |
| 网络、域名和生产部署 | Compose web 绑定 `127.0.0.1:18080`，生产 origin 设为 `https://lab.icthub.top`；`deploy.sh` 快进更新 main 后检查配置、构建和启动 | GitHub Actions 既有记录验证 Compose/API/Web；huawei2 SSH 可达，现有其他容器保持运行 | 配置 Authentik 自助注册与验证邮件；填入项目专用 OIDC client/secret、SMTP 和数据库密钥后执行 `./deploy.sh`；将 `lab.icthub.top` 规则指向 `http://127.0.0.1:18080` 并做 TLS/健康检查和回退演练 |
| 备份/灾备 | PostgreSQL + 私有 S3 同步脚本和操作说明已创建 | CI PostgreSQL 17.6/RustFS 隔离演练：备份探针行与对象，删除源对象后恢复到不同数据库/桶，核对行引用和对象字节，并确认目标桶多余对象清除；job 43 秒 | 完整应用数据/文件一致快照、应用健康和关联完整性、生产 RTO/RPO、保留/异地策略和灾难恢复 |

## 完成判定

- **CI 隔离环境通过**不代表连接了生产系统。当前还没有本项目专用生产 OIDC client/secret、SMTP 配置或真实打印机 Agent；补齐登录和邮件配置后才能启动公网业务。huawei2 路由上游为 `http://127.0.0.1:18080`。性能验收只覆盖 GitHub-hosted Ubuntu 24.04、100 条合成成员记录、单一登录会话和 50 个并发成员查询；不能视作生产容量 SLO。
- OJ 的目标工作区版本在只读盘点记录为 `f6b1cda3efcffce5a10a310762cfd1c6c268bb8f`。本仓交付的是连接器与精确契约；没有修改 `../xju-oj/`，也没有生成或声称验证了 OJ 源码补丁。
- 生产备份/恢复、真实硬件性能基准与生产上线未执行。部署前还需在指定环境完成目标配置、回退演练与授权审批。
