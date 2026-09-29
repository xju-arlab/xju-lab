# 新对话交接：完成 XJU Lab 开发

[根 README](../README.md) · [代理指南](../AGENTS.md) · [完整开发计划](plan/06-backend-completion.md) · [实际进度](progress.md)

> 2026-09-29。前端已基本成型；本轮整理公开仓库与开发入口，下一轮进入完整系统实施。当前后端仍未实现，不将准备工作描述为后端完成。

## 新对话提示词

在本仓库目录新开 Luna 对话，发送下面这一句：

> 请读取 AGENTS.md、docs/HANDOFF.md 和 docs/plan/06-backend-completion.md，保留现有前端设计与已确认业务规则，从首个未完成的 B00–B12 工作包连续完成本项目的后端、前端真实接入、Printer Agent、测试与部署配置，普通技术选择按文档默认值自主推进，外部缺项如实登记并继续所有可本地完成的工作，完成验收后更新文档并 add、commit、push 到 xju-arlab/xju-lab，最终报告真实完成范围与仍待生产联调的事项。

该提示词授权持续开发与本仓提交推送；不把缺少的生产凭据、真实设备或其他项目的变更当作已存在。开发与外部验收的边界见计划第 1、6 节。

## 真实起点

- `frontend/` 已有所有主要页面：总览、工位、项目/待办、会议、请假、打印、计算资源、考核、设置、资料、主页。
- `App.tsx` 仍承载大部分页面和演示状态；工位与考核已拆到 `features/`，其余按接入模块逐步拆分。
- `backend/` 只有 README；Java 工程、迁移、API、部署配置、CI、Printer Agent 尚未创建。
- 前端不请求真实 API。`frontend/src/api/contracts.ts` 是占位表；部分业务存 localStorage，其余为页面会话数据。正式模式必须改为服务端权威数据。
- 当前没有真实 OIDC、数据库、SMTP、对象存储、OJ 导入/角色同步、打印机或 Prometheus 接入。
- 本轮复跑：`pnpm build` 通过（1648 模块）；`pnpm test:assessment` 16/16；`pnpm test:seats` 通过。历史浏览器证据在进度中，本轮只改文档与忽略规则，没有重新验收全路由。

## 必须保留

- 现有中文界面、飞跃风格、品牌图、统一自定义下拉；项目卡片只显示中文名。
- 默认“算法与科研实验室”“信息楼A411”；演示资料姓名“赵文彪”不是身份或管理员引导依据。
- 工位确认布局：`frontend/src/features/seats/layout.confirmed.json`；来源：`docs/design/lab-layout-calibrated.json`。31 个可坐人工位，单布局、标定吸附、带箭头成员气泡、两方向/三年级配色、SVG/PNG 等距留白；不得以旧编辑器布局覆盖。
- ACM / 深度学习两个 Tab、各有本次/历史排行；老成员过滤先作用于各场再重算；同培养期理论笔试/机试混合历史、单场形式互斥；历史 25% + 当次 75%。细则见 [09 专项](design/09-assessment-and-showcase.md)。
- OJ 导入只有比赛链接一个必填输入；SUPER_ADMIN 同步为同一人 OJ Admin 的独立来源授权，撤销/停用也需同步。现有 OJ 登录覆盖角色的问题须按 [11 专项](design/11-oj-import-and-admin-sync.md)处理。
- GPU 数据目前为演示；CPU 部署服务器型号、核心数、内存、磁盘及利用率待录入，不能编造。
- 公开主页只允许显式发布的脱敏快照；内部数据不自动公开。

## 环境与首个动作

当前机器工作区：`/home/winbeau/xju-arlab/xju-lab`（WSL Ubuntu-22.04）。Windows UNC 是同一个目录。其他机器按实际 clone 路径运行。

Node 24.16.0、pnpm 10.17.1 已验证。非交互 WSL shell 可能未加载 nvm；当前 Node 位于 `~/.nvm/versions/node/v24.16.0/bin`，pnpm 可由该运行环境调用。使用 WSL Git，避免 Windows Git 对 UNC 所有权的误判。

```bash
git status --short --branch
git remote -v
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm test:assessment
pnpm test:seats
```

随后进入 B00：检查 Java/Docker/Python，创建 Spring Boot + 数据库/契约/CI 基座，并渐进拆出前端 API 数据层。不要重新做 F01 样式或只停在 F02。5173 可能已有开发服务，启动前检查并复用本项目服务。

当前预览路由：`/app/dashboard`、`/app/assessment`、`/app/seats`。服务是否仍运行须现场核实，本文不承诺进程常驻。

## 文档优先级与后续记录

用户当前要求 → `AGENTS.md` → 完整开发计划与最新决策 → 各专项规则 → 旧 F/A–E 流程。旧版“每轮只做一步、不开发后端”已失效；历史日志保留用于追溯，不恢复其旧限制。

按 B00–B12 连续执行并更新 `docs/progress.md`。外部缺项集中写 `docs/integration-status.md`（实施时创建），包括 OJ 新接口/补丁是否已在目标项目应用。外部未验证不得写全面完成。相邻参考仓库和生产权限变更按本次明确授权处理；可先交付本仓连接器、契约和补丁，不为等待外部信息停止其他模块。
