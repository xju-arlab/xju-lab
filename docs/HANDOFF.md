# 新对话交接：完成 XJU Lab 开发

[根 README](../README.md) · [代理指南](../AGENTS.md) · [完整开发计划](plan/06-backend-completion.md) · [实际进度](progress.md)

> 2026-09-29。本轮连续完成 B00–B12 本地实现，最新 GitHub Actions 全部通过。剩余是隔离数据库/对象存储恢复演练、生产/外部联调与最终交互式响应矩阵；当前没有生产发布。

## 新对话提示词

在本仓库目录新开 Luna 对话，发送下面这一句：

> 请读取 AGENTS.md、docs/HANDOFF.md 和 docs/plan/06-backend-completion.md，保留现有前端设计与已确认业务规则，从首个未完成的 B00–B12 工作包连续完成本项目的后端、前端真实接入、Printer Agent、测试与部署配置，普通技术选择按文档默认值自主推进，外部缺项如实登记并继续所有可本地完成的工作，完成验收后更新文档并 add、commit、push 到 xju-arlab/xju-lab，最终报告真实完成范围与仍待生产联调的事项。

该提示词授权持续开发与本仓提交推送；不把缺少的生产凭据、真实设备或其他项目的变更当作已存在。开发与外部验收的边界见计划第 1、6 节。

## 当前实现与待复验

- 前端保留原设计与显式 demo 模式，并新增 OpenAPI 生成类型的 API 模式；各主要业务页面已接真实 API。正式 API 失败不会退回假数据。
- `backend/` 是 Java 21 / Spring Boot 模块化单体；PostgreSQL/Flyway、Redis 会话、OIDC、权限、审计/outbox、各业务模块和 OpenAPI 契约均已创建。
- `printer-agent/` 包含独立 Python Agent、SQLite journal、CUPS/IPP 适配器和 systemd 服务文件。Agent 5 项 unittest 通过；隔离虚拟 CUPS/IPP 已收到测试 PDF。
- `deploy/`、GitHub Actions、Compose、Nginx、开发 Keycloak realm、Prometheus 模板、备份/恢复脚本和运维说明已加入。
- 最新 GitHub Actions [CI](https://github.com/xju-arlab/xju-lab/actions/runs/36646167259) 通过前端 build、assessment/seats、后端 28 项测试、6 个 Flyway 迁移、Python Agent 5 项单测及 Compose 配置检查；本机 `pnpm build` 与 assessment 17/17、Agent 5/5 也通过。
- OJ 目标接口、生产 Authentik/SMTP/S3/Prometheus、真实成员名单、实机打印、域名/TLS、生产备份恢复与上线均未验证。详见 [`integration-status.md`](integration-status.md)。

## 必须保留

- 现有中文界面、飞跃风格、品牌图、统一自定义下拉；项目卡片只显示中文名。
- 默认“算法与科研实验室”“信息楼A411”；演示资料姓名“赵文彪”不是身份或管理员引导依据。
- 工位确认布局：`frontend/src/features/seats/layout.confirmed.json`；来源：`docs/design/lab-layout-calibrated.json`。31 个可坐人工位，单布局、标定吸附、带箭头成员气泡、两方向/三年级配色、SVG/PNG 等距留白；不得以旧编辑器布局覆盖。
- ACM / 深度学习两个 Tab、各有本次/历史排行；老成员过滤先作用于各场再重算；同培养期理论笔试/机试混合历史、单场形式互斥；历史 25% + 当次 75%。细则见 [09 专项](design/09-assessment-and-showcase.md)。
- OJ 导入只有比赛链接一个必填输入；SUPER_ADMIN 同步为同一人 OJ Admin 的独立来源授权，撤销/停用也需同步。现有 OJ 登录覆盖角色的问题须按 [11 专项](design/11-oj-import-and-admin-sync.md)处理。
- GPU 数据目前为演示；CPU 部署服务器型号、核心数、内存、磁盘及利用率待录入，不能编造。
- 公开主页只允许显式发布的脱敏快照；内部数据不自动公开。

## 环境与最终复验

当前机器工作区：`/home/winbeau/xju-arlab/xju-lab`（WSL Ubuntu-22.04）。Windows UNC 是同一个目录。其他机器按实际 clone 路径运行。

Node 24.16.0、pnpm 10.17.1、Java 21 和 Docker Testcontainers 环境曾在此工作区使用。非交互 WSL shell 可能未加载 nvm；Node 位于 `~/.nvm/versions/node/v24.16.0/bin`。Git 与 Linux 构建优先在 WSL 运行，避免 Windows Git/Python 误处理 UNC 路径和 Linux `node_modules`。

```bash
git status --short --branch
git remote -v
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm test:assessment
pnpm test:seats
```

从本地灾备演练与外部联调继续，不重做已通过 CI 的 B00–B12：在隔离数据库/测试 bucket 演练备份恢复，再启动 API 完成双账户业务与前端 375/768/1440 px、键盘/下载产物复核。不要执行生产上线；有真实 OJ 接口/身份/邮件/设备时再按集成状态开展对应验收。5173 可能已有开发服务，启动前检查并复用本项目进程。

当前预览路由：`/app/dashboard`、`/app/assessment`、`/app/seats`。服务是否仍运行须现场核实，本文不承诺进程常驻。

## 文档优先级与后续记录

用户当前要求 → `AGENTS.md` → 完整开发计划与最新决策 → 各专项规则 → 旧 F/A–E 流程。旧版“每轮只做一步、不开发后端”已失效；历史日志保留用于追溯，不恢复其旧限制。

本仓外部缺项见 `docs/integration-status.md`，OJ 双系统契约见 `integrations/xju-oj/contract.md`。其他项目/生产环境未在当前授权范围内；未执行的真实联调必须继续明确标记为待验证。
