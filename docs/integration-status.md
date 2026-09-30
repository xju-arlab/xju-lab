# 外部集成状态

更新时间：2026-09-30。此表区分本仓实现、CI 隔离环境验证和必须由真实系统/人员/设备完成的联调。不得用合成身份或受控服务替代生产验收。

| 系统 | 本仓状态 | 已有受控验证证据 | 仍需完成 |
|---|---|---|---|
| SSH 服务器接入 | 管理员配置解析、最多三层 ProxyJump、主机指纹校验、密码认证后安装专用公钥、硬件快照与资产删除；密码不持久化 | 隔离 OpenSSH 跳板/目标的密码与免密连接、公钥幂等；PostgreSQL 权限/并发/取消/重启恢复；真实浏览器连接和保存/删除。最终截图复验与 CI 链接见 progress.md | huawei2 上三台已保存资产的 SSH CPU/内存/磁盘/负载采样已通过，GPU 资产的 NVIDIA 利用率也已通过；新增目标、密钥卷加密备份/撤销仍需逐项确认 |
| PostgreSQL / Redis | 完成服务配置、Flyway 迁移、会话/业务存储 | GitHub Actions 启动 PostgreSQL 17.6、Redis 7.4.3、RustFS；截至 V9 的迁移、后端集成测试和 Compose 配置检查通过。隔离恢复 job 验证探针行及关联对象字节 | 生产容量、完整应用库恢复、RTO/RPO 与异地灾备 |
| 身份提供方 | 独立 Authentik `xju-lab` 客户端已创建；普通成员仅接受已验证 `@icthub.top`。用户指定现有 `winbeau`，其确切 issuer/subject 可用已验证外域邮箱引导超级管理员，角色撤销后不会重新引导 | 七项 CI 含邮箱准入、确切引导/未验证/停用/撤权测试；生产 discovery、HTTPS callback、PKCE、state/nonce、Secure/HttpOnly 会话 Cookie 与稳定账户 ID 映射已核对；沿用现网邮箱验证和 MFA 流程 | 本人首次完整登录与实名登记、真实双用户隔离/撤权/CSRF、注册验证邮件投递 |
| 成员名册 | 增加一次性真实姓名/学号登记、唯一学号约束、本人班级/方向更新、班级派生年级和仅 SUPER_ADMIN 修改实名字段；姓名不从 OIDC 昵称推断 | PostgreSQL 注册 API 集成测试、班级格式单测和 OIDC 浏览器自助登记通过；用户名/学号真实性不由 CI 验证 | 真实成员资料逐人核对；班级简称/年级约定确认；SUPER_ADMIN 审计更正流程实测 |
| 对象存储 | S3 兼容对象存储用于数据库备份/恢复演练；打印 PDF 上传和私有文件 API 已删除 | 隔离恢复检查备份对象 key/字节与目标桶陈旧对象清理 | 生产备份 bucket、TLS、最小权限凭据、生命周期和完整业务数据库/对象一致性恢复演练 |
| SMTP / 通知 | 数据库 outbox、失败重试、生产阿里云 SMTP 465 SSL 已配置，凭据从现网 Authentik 受控读取；增加 SSL 与超时支持 | CI 通知/outbox 用例通过；生产 API 容器内 TLS 连接和 SMTP 认证成功；未发送真实测试邮件 | 实际收件人投递、退信/限流/告警及邮件端到端确认 |
| 打印机状态 | 打印页、PDF 文件 API、能力配置、打印队列和 Agent 派发/执行逻辑已删除；保留设备登记、凭据轮换、只读 CUPS 状态采集和心跳 | 2026-09-30 浏览器 CI 验证 Agent 心跳和仪表盘状态；隔离 API 测试确认旧取件/打印任务路由返回 404 | huawei2 上安装 status-only Agent，确认设备/CUPS 状态映射与耗材支持字段；此项目不执行打印 |
| SSH 指标采集 | 保存连接后后台定时执行固定只读采样；V9 存储 25 小时样本，提供 1/6/24 小时曲线 | 真实隔离跳板和 PostgreSQL 失败/过期/停用/删除回归；生产三台资产均取得有效采样（GPU 资产 5 项，其余各 4 项）；详见 progress.md | 历史从本次上线积累；非 NVIDIA GPU 缺工具时显示暂无采样，SSH 采集不提供 Prometheus 告警 |
| Prometheus / exporters | 固定查询后端、资产映射、过期/缺失处理和告警去重已实现 | 2 个 client 测试 + 监控状态单测；未启动真实 Prometheus 抓取节点 | 生产 Prometheus origin/token、固定标签核对、真实 CPU/GPU exporter 和告警恢复（SSH 指标采集已单独验证） |
| XJU OJ | LabOS 单链接导入任务、结果固定 URL 连接器、角色 outbox/版本确认已实现；接口要求见 [`../integrations/xju-oj/contract.md`](../integrations/xju-oj/contract.md) | 本地连接器响应/错误测试和导入任务持久化用例；没有真实 OJ 服务请求 | 目标 OJ 端受限成绩接口、按来源隔离授权表、旧登录覆盖逻辑修复、服务 token、真实映射/分页/重判/乱序撤销联调 |
| 网络、域名和生产部署 | huawei2 `/home/winbeau/projects/xju-lab` 已部署 main；`.env` 权限 600、Git 忽略；Web 绑定 `127.0.0.1:18080`，公开 `https://lab.icthub.top`；四个服务自动重启策略已配置 | `d69596e` 七项 CI 通过；部署脚本成功；本机及公网 Web/health/ready 200、匿名 session 401、OIDC 302 参数/Cookie 核对；公网 Chromium 首页和三视口登录入口验证通过。数据库 V9、31 工位 | 生产容量/压力、完整备份恢复、RTO/RPO、回退与宿主机重启演练；不要将可访问等同于所有外部集成验收 |
| 备份/灾备 | PostgreSQL + 私有 S3 同步脚本和操作说明已创建 | CI PostgreSQL 17.6/RustFS 隔离演练：备份探针行与对象，删除源对象后恢复到不同数据库/桶，核对行引用和对象字节，并确认目标桶多余对象清除；job 43 秒 | 完整应用数据/文件一致快照、应用健康和关联完整性、生产 RTO/RPO、保留/异地策略和灾难恢复 |

## 完成判定

- **CI 隔离环境通过**不代表所有生产集成完成。huawei2 的生产 `.env`、独立 OIDC、SMTP、数据库/Redis 和公网路由已配置且完成上表检查；真实打印机 Agent、OJ 接口和 Prometheus 尚未接入。性能验收只覆盖 GitHub-hosted Ubuntu 24.04、100 条合成成员记录、单一登录会话和 50 个并发成员查询，不能视作生产容量 SLO。
- OJ 的目标工作区版本在只读盘点记录为 `f6b1cda3efcffce5a10a310762cfd1c6c268bb8f`。本仓交付的是连接器与精确契约；没有修改 `../xju-oj/`，也没有生成或声称验证了 OJ 源码补丁。
- 已按用户本次授权完成生产上线；生产完整备份/恢复、真实硬件性能基准、回退和宿主机重启演练未执行。本人真实登录及邮件端到端投递仍须与实际人员验证，不能用合成身份或跳过 MFA 替代。
