# 新对话交接：完成 XJU Lab 开发

[根 README](../README.md) · [代理指南](../AGENTS.md) · [完整开发计划](plan/06-backend-completion.md) · [实际进度](progress.md)

> 2026-09-30。已部署 huawei2，公网 [lab.icthub.top](https://lab.icthub.top) 与 [成员入口](https://lab.icthub.top/app/dashboard) 实测可访问。代码 `2d9fe00` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36744319059)；服务器实时查询默认关闭，开启才查询，后台不再定时连接 SSH。生产 `.env` 已安全配置（600、Git 忽略）；独立 Authentik 客户端、数据库 V11/31 工位、Redis、SMTP SSL 认证与 HTTPS/PKCE 登录跳转已验证。仅保留打印机状态，已绑定惠普只读接口并验证持续同步。用户指定现有 `winbeau` 的确切 issuer/subject 作为首位超级管理员，已验证外域邮箱仅对该身份例外，首次真实登录才创建角色；普通成员仍限定 `@icthub.top`。真实完整登录、邮件投递、OJ、设备与完整灾备仍待联调。huawei2 更新命令：`cd /home/winbeau/projects/xju-lab && ./deploy.sh`，代理上游 `http://127.0.0.1:18080`。

## 新对话提示词

在本仓库目录新开 Luna 对话，发送下面这一句：

> 保持 `main` 分支。读取 AGENTS.md、docs/HANDOFF.md 和 docs/plan/06-backend-completion.md，保留现有产品设计；仅保留打印机状态；Lab 开放已验证 `@icthub.top` 邮箱注册，Lab/OJ 使用同一身份提供方但产品角色隔离；完成实名姓名/学号、班级解析年级、多选方向及管理员更正。继续 huawei2 部署与验证。使用 GitHub CLI 核对 xju-arlab/xju-lab，提交并推送到 main。生产外部配置缺项需记录并继续所有可本地完成事项。

该提示词授权持续开发与本仓提交推送；不把缺少的生产凭据、真实设备或其他项目的变更当作已存在。开发与外部验收的边界见计划第 1、6 节。

## 当前实现与待复验

- 新建项目的平台切换默认隐藏，随展开淡入、收起淡出；展开控件与会议记录统一为原生三角箭头。最新验证/部署见 `progress.md` 首条。

- 最新增量：请假私有附件、会议地址与当天默认时间、项目 GitHub/百度网盘资料切换、正式工位完整标定与服务端保存、公开主页完整标志。数据库新增 V11；无需新增生产环境变量，附件限量存于 PostgreSQL 并随数据库备份。huawei2 已部署 `2d9fe00`，七项 CI 全部通过；检查与发布证据见 `progress.md` 首条。

- 打印机卡片按最新反馈调整为左侧型号/状态、右侧并排墨盒；读取时间与在线标签在右上角同排，运行状态/纸张为小圆角胶囊。验证与上线记录见 `progress.md` 最新条目。

- 新增惠普固定状态接口绑定，生产启用 `HP_PRINTER_STATUS_ENABLED=true`；总览分别展示纸张与墨盒，默认开发/CI 不访问真实源。已部署并验证真实持续同步，七项 CI 全部通过；实际证据见 `progress.md` 最新条目。

- 会议说明已删除；日期字段使用统一中文日历/文本输入，页面显示年月日与 24 小时制时间，保留北京时间和原 API 日期格式。覆盖会议、请假、项目、行动项和里程碑；跨浏览器语言/时区与三视口证据见 `progress.md` 最新条目。

- 计算资源新增默认关闭的「实时查询」滑动开关，位于添加按钮左侧；关闭/离开页面不再发起指标查询。后台已移除全资产 SSH 定时采集，仅响应已鉴权的指标请求并复用近期样本。GPU 相同型号合并为「型号 ✕ 数量」。具体检查与部署状态见 `progress.md` 最新条目。

- 本次新增登录检查/跳转过渡与统一查询缓存（会话内 30 秒、指标 5 秒，保存/退出/身份权限变化失效，不持久化私有 API）。共享请求去重，旧请求不得覆盖新条件；失败显示重试。SSH 服务器补上固定只读自动采样和 PostgreSQL V9 历史曲线。实际验证/发布状态见 progress.md 最新条目。

- 成长与考核页已移除“培养期、成员与场次管理”卡片，方向切换放到标题同一行右侧。数据更新使用占位、轻微淡入/高度缓动并阻止过时请求覆盖新结果；加载时不显示错误查询的旧排行，禁用发布/导出，失败可重试。具体证据见 `progress.md`。

- 真实 API 页面已统一使用原有 ComboBox；会议参会成员支持多选，表单保留必填与重置。工位点击直接显示三角指向的小圆角气泡，展示编号、姓名、班级、方向和当前请假状态；普通浏览不再使用地图下方详情面板。API 图形与气泡不再从同名演示成员补资料。测试、发布证据见 `progress.md` 最新记录。

- 实名登记页已按最新六点精简：三个必填红星、单一班级示例、小圆角多选方向，无自定义方向入口、邮箱说明和身份 issuer 展示；具体本轮检查见 `progress.md`。

- 新增管理员 SSH 服务器接入，见 [连接与部署说明](ssh-server-onboarding.md)。`5702a17` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36700248167)，含真实隔离跳板/密码/公钥免密、数据库权限与并发、浏览器添加/删除和三视口弹窗。SSH 别名来自服务端挂载目录，专用密钥保存在 Compose `ssh-state` 卷，不能删除或提交该卷；真实实验室 SSH/GPU/exporter 仍待生产联调。

- 前端保留原设计与显式 demo 模式，并新增 OpenAPI 生成类型的 API 模式；各主要业务页面已接真实 API。正式 API 失败不会退回假数据。
- `backend/` 是 Java 21 / Spring Boot 模块化单体；PostgreSQL/Flyway、Redis 会话、OIDC、权限、审计/outbox、各业务模块和 OpenAPI 契约均已创建。
- `printer-agent/` 保留独立 Python 状态 Agent、只读 CUPS 状态采集和 systemd 服务文件；不含 SQLite 打印 journal 或打印任务执行代码。
- `deploy/`、GitHub Actions、Compose、Nginx、开发 Keycloak realm、Prometheus 模板、备份/恢复脚本和运维说明已加入。
- GitHub Actions [上线代码全栈 CI](https://github.com/xju-arlab/xju-lab/actions/runs/36704814912) 七个作业全部通过，覆盖前端、PostgreSQL 后端、统一验证、SSH、OIDC 浏览器业务闭环、Printer Agent 与隔离备份恢复。具体路由、视口和性能口径见 [`progress.md`](progress.md)。
- 下一步由 `winbeau` 完成首次真实登录及实名登记，再验证普通 `@icthub.top` 用户隔离、实际邮件投递和硬件/OJ 接入。部署与 `.env` 已完成，不要重新生成生产数据库/审批密钥。构建代理用 `LAB_BUILD_NETWORK=host`，应用运行仍使用独立网络；详见 [`operations.md`](operations.md) 和 [`integration-status.md`](integration-status.md)。

## 必须保留

- 现有中文界面、飞跃风格、品牌图、统一自定义下拉；项目卡片只显示中文名。
- 默认“算法与科研实验室”“信息楼A411”；演示资料姓名“赵文彪”不是身份或管理员引导依据。
- 工位确认布局：`frontend/src/features/seats/layout.confirmed.json`；来源：`docs/design/lab-layout-calibrated.json`。31 个可坐人工位，单布局、标定吸附、带箭头成员气泡、两方向/三年级配色、SVG/PNG 等距留白；不得以旧编辑器布局覆盖。
- ACM / 深度学习两个 Tab、各有本次/历史排行；老成员过滤先作用于各场再重算；同培养期理论笔试/机试混合历史、单场形式互斥；历史 25% + 当次 75%。细则见 [09 专项](design/09-assessment-and-showcase.md)。
- OJ 导入只有比赛链接一个必填输入；SUPER_ADMIN 同步为同一人 OJ Admin 的独立来源授权，撤销/停用也需同步。现有 OJ 登录覆盖角色的问题须按 [11 专项](design/11-oj-import-and-admin-sync.md)处理。
- Lab 普通成员自助注册只允许邮箱已验证且域名精确为 `icthub.top`；已获用户授权的确切管理员引导身份可使用已验证外域邮箱。实名、学号、班级和至少一个方向完成前，服务端拒绝其他业务 API。班级由服务端按 `专业简称YY-班号` 解析年级；普通成员不可修改姓名/学号，仅 SUPER_ADMIN 可审计更正。
- 演示模式的 GPU 数据仅用于原型；正式计算资源读取真实 SSH / Prometheus 数据。未识别硬件与未采集指标继续明确标记，不编造。
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

本仓 B00–B12 已通过 CI 验收，不重复搭建脚手架。下一步按 [`integration-status.md`](integration-status.md) 取得真实 OJ/Authentik/SMTP/S3/Prometheus/成员名单和设备条件，分项完成联调；部署前完成生产域名/TLS、目标容量、完整数据恢复、RTO/RPO、回退与授权检查。不要在未获当次授权时发布生产。若继续本地开发，5173 可能已有本项目服务，启动前检查并复用。

当前预览路由：`/app/dashboard`、`/app/assessment`、`/app/seats`。服务是否仍运行须现场核实，本文不承诺进程常驻。

## 文档优先级与后续记录

用户当前要求 → `AGENTS.md` → 完整开发计划与最新决策 → 各专项规则 → 旧 F/A–E 流程。旧版“每轮只做一步、不开发后端”已失效；历史日志保留用于追溯，不恢复其旧限制。

本仓外部缺项见 `docs/integration-status.md`，OJ 双系统契约见 `integrations/xju-oj/contract.md`。本次用户授权已用于 Lab 的 huawei2 部署、独立 OIDC 配置和确切管理员引导；没有修改 OJ/登录前端代码或全局身份角色。未执行的真实联调继续明确标记为待验证。
