# 新对话交接：完成 XJU Lab 开发

[根 README](../README.md) · [代理指南](../AGENTS.md) · [完整开发计划](plan/06-backend-completion.md) · [实际进度](progress.md)

> 2026-10-08 登录修复（北京时间）：huawei2 已部署 `e6355fa`，本机 80 项后端检查通过，**用户已确认真实登录后直接进入控制台**。先将后台 Authentik 请求改为内部连接，消除公网超时；随后修复 Java 默认 h2c 升级导致的令牌 POST 文本 400 与 `login_expired` 回环，内部传输固定 HTTP/1.1，保留公开 HTTPS issuer、PKCE 与完整校验。生产 `.env` 的 `LAB_OIDC_LOCAL_BACKCHANNEL=true` 必须保留，手工 Compose 更新须带 `deploy/compose.oidc-local.yaml`。内部 discovery/JWKS 约 0.24 秒；成功回调直达 `/app/dashboard`，首次成员仍需实名登记。公网身份表单冷启动首开仍约 5.7 秒，不宣称已解决身份站全部加载延迟。CI 注册测试的导航等待竞态已单独修正；配置、回退及验证证据见 `operations.md` / `progress.md`，不能复用旧回调授权码。

> 2026-10-08 增量（北京时间）：已在 huawei2 部署红蜻蜓功能 `f542f31`，独立入口 `/app/hongqingting`；管理员侧栏顺序为「红蜻蜓 → 公开主页 → 成员管理」，普通用户不可见且后端拒绝访问。使用既有 OIDC 会话，移除 sk-key；V12 保存批次/outbox，未知结果不自动重发。七项 CI 全通过（72 后端 / 28 浏览器）。上游配置已迁入服务器受限 `.env`，不要重置；未执行真实跑步上传。公网 dashboard 曾间歇超时，源站正常；本次启动也遇到 OIDC discovery 超时，重启一次后恢复，当前页面/ready 正常。部署、回退镜像和备份证据见 `progress.md` 最新条目，协议见 `integrations/hongqingting/README.md`。

> 2026-10-01。已部署 huawei2，公网 [lab.icthub.top](https://lab.icthub.top) 与 [成员入口](https://lab.icthub.top/app/dashboard) 实测可访问。代码 `9d3b9e1` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36819303517)；服务器实时查询默认关闭，开启才查询，后台不再定时连接 SSH。生产 `.env` 已安全配置（600、Git 忽略）；独立 Authentik 客户端、数据库 V11/31 工位、Redis、SMTP SSL 认证与 HTTPS/PKCE 登录跳转已验证。仅保留打印机状态，已绑定惠普只读接口并验证持续同步。用户指定现有 `winbeau` 的确切 issuer/subject 作为首位超级管理员，仅该确切身份可一次性引导管理员角色；2026-10-01 已澄清普通成员允许任意已验证邮箱，已有 OJ 统一账号直接复用。请假邮件实际收件已获用户确认；真实完整登录、OJ、设备与完整灾备仍待联调。huawei2 更新命令：`cd /home/winbeau/projects/xju-lab && ./deploy.sh`，代理上游 `http://127.0.0.1:18080`。

## 新对话提示词

在本仓库目录新开 Luna 对话，发送下面这一句：

> 保持 `main` 分支。读取 AGENTS.md、docs/HANDOFF.md 和 docs/plan/06-backend-completion.md，保留现有产品设计；仅保留打印机状态；Lab 开放任意已验证邮箱注册（`PRODUCT_REGISTRATION_DOMAIN=*`），已有 OJ 统一账号直接登录，Lab/OJ 使用同一身份提供方但产品角色隔离；完成实名姓名/学号、班级解析年级、多选方向及管理员更正。继续 huawei2 部署与验证。使用 GitHub CLI 核对 xju-arlab/xju-lab，提交并推送到 main。生产外部配置缺项需记录并继续所有可本地完成事项。

该提示词授权持续开发与本仓提交推送；不把缺少的生产凭据、真实设备或其他项目的变更当作已存在。开发与外部验收的边界见计划第 1、6 节。

## 当前实现与待复验

- 统一身份认证成功后已改为直接返回 `/app/dashboard`，避免绕回公开主页；新成员仍先完成实名登记。`9d3b9e1` 已部署到 huawei2，七项 CI 全通过（60 后端 / 23 浏览器检查），公网匿名登录入口通过；证据见 progress.md 首条。

- 2026-10-01 生产邮件漏发已定位为带显示名称的 MAIL_FROM 被重复包装。生产配置已规范化并恢复发送，两条受影响通知已被 SMTP 接受，用户已明确确认收到补发通知。`f5afb18` 已部署，七项 CI 全通过（59 后端 / 22 浏览器检查），未发送队列为 0；验证记录见 progress.md 首条；不要重新回放已处理的旧待审批邮件。

- 已部署 `ce7c25c`：管理员限定的请假审批与邮件通知，生产邮件开关已启用。用户确认采用“邮件打开详情 → 免登录点一次确认 → 申请人收到结果”；读取、扫描和刷新均不消费令牌，只有 CSRF 保护的 POST 才修改状态。邮件含原始附件，详情图片可点开预览，凭证失效后文件接口同步失效。58 项后端与 22 项浏览器检查通过；真实业务通知收件已于随后的发件地址修复中获用户确认。详细记录见 progress.md 首条，设计与运维见 leave-email-approval.md。

- 2026-10-01 已排查并修复登录回调 403：原先误把统一账号域名当作邮箱后缀限制，现允许任意已验证邮箱（163/QQ/Gmail 等），生产 `PRODUCT_REGISTRATION_DOMAIN=*`。已有 OJ 统一账号直接登录，新用户可从 Lab 或身份登录页进入注册；首次进入 Lab 仍填写实名资料。`309f089` 已部署，七项 CI 全通过，公网匿名登录、两条注册入口及过期回调中文反馈实际通过。真实账号提交登录/新注册邮件验证仍需实际用户重试确认；详见 `progress.md`。

- Lab 登录卡片增加“还没有账号？立即注册”，使用共用 Authentik 注册页并带加载反馈；完成身份注册后通过固定 Lab 应用入口返回，不携带等待验证邮件期间可能过期的 OIDC state。普通成员邮箱准入已按 2026-10-01 用户澄清放开到任意已验证邮箱，实名登记规则保留。功能提交 `e937697` 已部署，七项 CI 与生产源站注册入口检查通过。认证仓库的既有改动已保存为 `f82d0b0`，本机和 huawei2 均为干净 `main`。公网浏览器与真实提交的验证边界见 `progress.md`。

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
- 下一步由 `winbeau` 完成首次真实登录及实名登记，再验证任意已验证邮箱的普通用户隔离、真实邮件中的审批操作和硬件/OJ 接入。请假邮件实际收件已确认。部署与 `.env` 已完成，不要重新生成生产数据库/审批密钥。构建代理用 `LAB_BUILD_NETWORK=host`，应用运行仍使用独立网络；详见 [`operations.md`](operations.md) 和 [`integration-status.md`](integration-status.md)。

## 必须保留

- 现有中文界面、飞跃风格、品牌图、统一自定义下拉；项目卡片只显示中文名。
- 默认“算法与科研实验室”“信息楼A411”；演示资料姓名“赵文彪”不是身份或管理员引导依据。
- 工位确认布局：`frontend/src/features/seats/layout.confirmed.json`；来源：`docs/design/lab-layout-calibrated.json`。31 个可坐人工位，单布局、标定吸附、带箭头成员气泡、两方向/三年级配色、SVG/PNG 等距留白；不得以旧编辑器布局覆盖。
- ACM / 深度学习两个 Tab、各有本次/历史排行；老成员过滤先作用于各场再重算；同培养期理论笔试/机试混合历史、单场形式互斥；历史 25% + 当次 75%。细则见 [09 专项](design/09-assessment-and-showcase.md)。
- OJ 导入只有比赛链接一个必填输入；SUPER_ADMIN 同步为同一人 OJ Admin 的独立来源授权，撤销/停用也需同步。现有 OJ 登录覆盖角色的问题须按 [11 专项](design/11-oj-import-and-admin-sync.md)处理。
- Lab 普通成员允许任意已验证邮箱（163、QQ、Gmail 等）；`icthub.top` 是平台域名，不限制邮箱后缀。已有 OJ 统一账号直接登录，新账号只获 MEMBER；超级管理员仍仅由已授权的确切 issuer + subject 一次性引导。实名、学号、班级和至少一个方向完成前，服务端拒绝其他业务 API。班级由服务端按 `专业简称YY-班号` 解析年级；普通成员不可修改姓名/学号，仅 SUPER_ADMIN 可审计更正。
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
