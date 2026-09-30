# 实施进度与验收记录

[交接入口](HANDOFF.md) · [完整开发计划](plan/06-backend-completion.md) · [总索引](README.md)

> 更新时间：2026-09-30（B00–B12 与七项 CI 通过；huawei2 已上线 `https://lab.icthub.top`，生产 OIDC/SMTP/数据库已配置，打印仅保留状态；真实完整登录、邮件投递、OJ 和硬件联调待完成）。

## 当前状态

本仓后端、前端真实 API 模式、状态 Agent、实名与 SSH 管理均已实现，并保留确认的视觉与业务规则。huawei2 已运行 PostgreSQL、Redis、API 和 Web；公网 `https://lab.icthub.top` 实测可访问，反向代理上游为 `http://127.0.0.1:18080`。代码 `9c199ff` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36719040292)。部署脚本只允许快进更新 `main`，生产配置已完成；真实用户完整登录、邮件投递、外部 OJ/设备和完整灾备仍待验收。下文保留历史记录，不能将早期“尚未上线”视为当前状态。性能 smoke 不是生产 SLO。

## 后端与全栈工作包状态

### 2026-09-30：登录过渡、会话缓存与 SSH 运行指标

- 最终代码 `9c199ff` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36719040292)，含目录 700 / 脚本 600 的镜像权限复现和普通 app 账户加载 worker 检查。此前 `9b35f57` 七项 CI 也全部通过；本次浏览器套件为 5 项，包含真实 OIDC/业务/三视口，以及慢会话、登录跳转、缓存命中与保存后失效、错误重试和 reduced-motion。
- huawei2 已通过 `./deploy.sh` 部署最终代码，数据库迁移到 V9；公网首页、assessment/dashboard 和 ready 均 200，匿名监控 API 返回 401。JS/CSS 为 `index-DZ7A6Jxw.js` / `index-WUYudAnT.css`。公网匿名浏览器实际走通首页进入 → 登录页 → 统一身份待跳转状态 → auth.icthub.top，未填写生产凭据。
- 正式后台连续两次现场核验：三台资产均 CONNECTED；有效采样数从各 1 条增加到 3/5/3 条，GPU 资产 5 项 AVAILABLE、其余两台各 4 项，最新采样年龄 29–59 秒。曲线从本次上线的真实样本开始积累，未补造历史；运行按 30 秒调度、两台并发，多个目标可能分批更新。
- 生产发现宿主机受限 umask 使脚本/目录复制后普通服务账户不可读；固定代码读取与目录遍历权限，并以普通账户执行构建检查后恢复采集。一次 Docker Hub TLS 握手超时已重试成功；构建工具和 Maven 依赖现已缓存，避免后续 SSH 代码改动重复下载/编译。部署日志 `~/.local/state/xju-lab-tools/deploy-query-ssh-permissions-retry.log`；连续采样证据 `monitor-deployed-check.log` / `monitor-deployed-repeat.log` 位于同目录，不进入 Git。

- 首页进入平台先验证会话，身份检查和统一登录跳转均显示轻量动画，避免登录页闪现。统一页面占位、顶部更新提示、淡入与减少动画支持；服务器和曲线查询复用同一加载机制。
- 内存查询缓存按已验证身份/角色隔离，常规 30 秒、指标 5 秒，120 条/5 分钟保留上限；合并同路径请求，保存后使缓存失效，退出/401/403/身份变更清理私有数据。重新打开新条件不混入旧数据；旧请求不能覆盖保存后的结果。无私有 localStorage/Service Worker 缓存。
- SSH 弹窗保留指定指纹文案，配置说明改为三条无序列表。生产只读排查确认三台已保存服务器有 SSH 通道但没有 Prometheus target，因此旧实现一直显示待接入；新增固定只读 SSH 后台采样与 V9 历史样本表，GPU 不支持时不显示该项。
- 本地 TypeScript/Vite（1661 模块）、17 项计分、工位回归、7 项缓存测试和 3 项慢登录/缓存/失败重试浏览器测试通过。浏览器测试使用隔离合成数据；首次登录跳转测试的 HTML fixture 缺 UTF-8 导致中文断言失败，补齐编码后重跑通过。
- 本地 375/768/1440 px 验证监控卡片、三条配置说明、简化指纹文案、无横向溢出和无页面错误；截图 `C:/Users/genev/AppData/Local/Temp/xju-lab-monitor-{375,768,1440}.png` 与 `xju-lab-ssh-fingerprint-{375,768,1440}.png`，已查看手机和桌面。
- `2ee6048` 的前端、真实跳板、浏览器业务等检查通过；新增 PostgreSQL 用例在重置 Mockito answer 时触发空输入，`1c7b7ac` 修正测试后 backend / verify-script 均通过。前端另补查询超时与长期停留后的缓存过期恢复，并重跑 7 项缓存/3 项浏览器测试通过。
- huawei2 上通过现有密钥/已固定主机指纹，对三台已有资产执行新的只读采样：三台 CPU/内存/磁盘/负载均 AVAILABLE，GPU 资产的 NVIDIA 利用率 AVAILABLE，另两台为 UNSUPPORTED。证据日志 `~/.local/state/xju-lab-tools/monitor-readonly-check.log` 不进入仓库。此条记录部署前的采集器现场验证；正式后台调度/持久化与最终发布结果见本节顶部。

### 2026-09-30：精简考核页并平滑状态切换

- 移除“培养期、成员与场次管理”卡片及其专用前端查询/表单；ACM / 深度学习切换移到标题同排右侧。保留既有计分、筛选、导入、成绩修订、发布及 CSV 流程，后端管理 API 不变。
- 增加排行区域占位、同一查询刷新时保留/淡化内容、180–240ms 缓动/轻微淡入和高度过渡；方向切换时导入卡片平滑收起。加载状态按请求路径关联，取消过时请求，错误时显示重试，不将其他查询的旧结果显示到新条件下；支持 reduced-motion。
- 本地 TypeScript、Vite production build（1656 模块）、17 项计分与工位回归通过，浏览器用例可加载。隔离 Chromium 合成数据覆盖 375/768/1440 px 标题同排右对齐、卡片移除、慢请求占位/禁用操作、快速切换、错误重试、空状态、本次/历史排行与减少动画。截图 `C:\Users\genev\AppData\Local\Temp\xju-lab-assessment-{heading,theory}-{375,768,1440}.png`；已查看手机与桌面截图，不含真实成员数据。
- 代码 `614e8f2` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36712495895)。浏览器业务用例通过真实鉴权 API 准备被移除表单对应的测试资料，继续验证成绩修订/发布/CSV，并新增延迟排行查询、占位与禁用操作检查；业务用例 33.4 秒，SSH 用例 10.7 秒，两项共 44.7 秒。
- huawei2 已在 `main` 执行 `./deploy.sh` 成功，应用和 Web 已重建；日志 `~/.local/state/xju-lab-tools/deploy-assessment-transitions.log`。公网 `/app/assessment`、ready 均 200，已提供新版标题切换和过渡资源；生产成员数据呈现需真实登录查看。

### 2026-09-30：气泡取消滚动条并柔化指示角

- 按用户追加要求，工位气泡取消内部高度限制和滚动容器，内容自然展开；三角指示角增加 3px 圆角，卡片仍为 8px 小圆角。
- Vite production build 通过（1655 模块）。复用隔离 Chromium 检查，在 375/768/1440 px 核对气泡内容、边界、无内部滚动区与圆润指示角，并复查键盘/关闭和下拉表单流程；手机截图已查看。未增加纯样式镜像单元测试。
- 代码 `197bc5d` 已在 huawei2 通过 `./deploy.sh` 发布；公网工位页与 ready 均 200，新 CSS `index-BqORo1wJ.css` 确认包含 `overflow:visible` 和指示角 `border-radius:3px`。日志 `~/.local/state/xju-lab-tools/deploy-seat-bubble-polish.log`；[本次全量 CI](https://github.com/xju-arlab/xju-lab/actions/runs/36711149383) 在发布检查时仍运行中，此处不将其记为已通过。

### 2026-09-30：恢复统一下拉与工位三角气泡

- 正式 API 模式的 12 处原生下拉统一复用已有 ComboBox，包括 ACM 比赛、理论考试、培养期、成员/负责人/审批人和时区；会议参会成员保留多选。补齐必填提示、原生表单校验、FormData 多值、重置和空列表反馈，保留原有键盘与浮层样式。
- 工位气泡复用已确认原型的桌面锚点与三角定位，8px 小圆角；展示编号、真实姓名、班级、方向与当前请假（若有）。管理员分配/解除在气泡内完成，布局标定控件继续保留；API 成员信息不再从同名 demo 名册补全。
- Windows 隔离依赖目录执行 TypeScript、Vite production build（1655 模块）、17 项考核测试、工位回归和 Playwright 用例加载，均通过。工位回归新增 API 与 demo 同名时不回退、2027 年级和新方向字段保真检查。
- 隔离 Chromium 合成会话覆盖 375/768/1440 px：气泡/三角/字段/边界、空与有选项菜单、键盘和焦点返回、外部点击、必填阻止提交、表单重置、多选 FormData、已分配成员过滤。截图 `C:\Users\genev\AppData\Local\Temp\xju-lab-seat-bubble-{375,768,1440}.png` 与 `xju-lab-combobox-{375,768,1440}.png`；核对桌面与手机截图，不含真实成员数据。
- 代码 `6da246c` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36708522067)。真实 OIDC/API 浏览器业务用例 37.5 秒，覆盖必填拦截、统一下拉提交、工位分配后气泡展示、刷新持久化、Escape 焦点返回和 SVG/PNG 导出；SSH 用例 14.1 秒，两项共 52.6 秒。
- huawei2 在 `main` 执行 `./deploy.sh` 成功，应用与 Web 已重建启动，PostgreSQL/Redis 健康。公网 `/`、`/app/seats`、`/api/v1/health`、`/api/v1/ready` 均 200。发布日志：`~/.local/state/xju-lab-tools/deploy-seat-bubble.log`。完整生产成员资料展示仍需真实账号查看，本轮不代替本人登录。

### 2026-09-30：精简成员实名登记页

- 按用户六点调整：移除邮箱/实名说明和身份 issuer 展示；姓名、学号、班级添加红色必填星号；班级示例仅保留 `计算机24-3`；研究方向改为 6px 小圆角选项；登记页移除自定义方向输入和添加按钮，保留多选与至少一项校验。
- TypeScript 与 Vite production build 通过（1653 模块）。隔离 Chromium 使用本地合成会话核对文案删除、三个 required 字段/红星、无自定义输入、两个方向选项，以及 375/768/1440 px 无横向溢出；截图为 `C:\Users\genev\AppData\Local\Temp\xju-lab-registration-{375,768,1440}.png`，不含真实个人资料。
- 现有 OIDC 浏览器登记流程同步移除自定义方向填写步骤，并检查该输入不存在。该调整限于登记页呈现，不修改实名保护、班级派生年级和数据库接口。
- 代码 `0c5f4dc` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36706451397)，包括真实隔离 OIDC 登记/保存与后续业务流程。huawei2 `./deploy.sh` 成功；公网已提供新 JS/CSS（`index-B-xlyerS.js` / `index-ylC81aP2.css`），核对旧说明不再出现在登记代码、新红星和小圆角样式存在。服务器构建日志：`~/.local/state/xju-lab-tools/deploy-registration.log`。

### 2026-09-30：生产身份配置与飞跃风格修订

- `1a20457` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36702857241)：frontend、backend、verify-script、ssh-onboarding、printer-agent、backup-restore、browser-e2e。新 PostgreSQL 用例确认外域管理员引导必须精确匹配 issuer/subject 且邮箱已验证，身份不符、未验证和停用均拒绝，撤权后登录不再次授予超级管理员。
- 按 `../xju-feiyue` 的 Dialog、UploadDialog、Progress 和颜色 token 调整服务器弹窗：中性色背景、细分隔线、小尺寸青绿勾选图标、细进度条与淡入；移除大圆形亮绿弹跳效果。保留移动边界、键盘与 reduced-motion。浏览器 SSH 用例 13.4 秒，业务用例 38.0 秒，总计 52.3 秒。375/768/1440 px 截图逐一复核，位于本次 CI 的 `browser-evidence`，本机副本 `C:\Users\genev\AppData\Local\Temp\xju-ssh-evidence-1a20457`。
- 只读参考 huawei2 的 auth-login 配置及 huawei1 `/home/winbeau/xju-OJ/.env`，从实际运行的 Authentik 读取已配置邮件服务。在 huawei2 新建独立 Lab OIDC 客户端并使用现网邮箱验证与稳定账户 ID 映射；公开 discovery 已返回成功。没有修改 OJ 的客户端、代码或角色。
- 生产 `.env` 已写入 huawei2 仓库（权限 `600`、Git 忽略），数据库/Redis/审批密钥独立生成，SMTP 为阿里云 465 SSL。首位超级管理员按用户明确授权绑定现有 `winbeau` 的确切身份，需首次真实登录才引导角色。仓库不记录秘密值或该 subject。
- Windows 隔离依赖目录完成 TypeScript 和 Vite production build（1653 模块）；没有改动 WSL 的依赖目录。Compose 四个生产服务增加重启恢复策略。
- 首次服务器构建因 Docker 客户端的回环代理在构建容器内不可达而失败。`aad0e92` 增加仅作用于构建阶段的 `LAB_BUILD_NETWORK`，huawei2 使用 `host`，其余环境保持默认；不修改全局 Docker 配置或应用运行网络。修复后的 [七项 CI 再次全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36703509270)。
- 生产代码 `d69596e` 已部署，最终 `./deploy.sh` 返回成功；修正首次无公开快照时的健康检查（使用 health/ready，不要求公开资料 200）、脚本自更新后重新执行与回环探测绕过代理。最终 [七项 CI 全通过](https://github.com/xju-arlab/xju-lab/actions/runs/36704814912)。
- huawei2 与公网检查：`/`、`/app/dashboard`、`/api/v1/health`、`/api/v1/ready` 均 200；匿名 session 401；尚未发布的 lab-profile 为预期 404，浏览器显示空状态。公开 OIDC 跳转核对专用 client、HTTPS callback、S256 PKCE、state/nonce 和 Secure/HttpOnly Cookie；数据库为 V8，31 工位。SMTP 465 TLS 与认证成功，没有发送测试邮件。
- 公网 Chromium 实测首页和登录入口，375/768/1440 px 登录页无横向溢出；截图 `C:\Users\genev\AppData\Local\Temp\xju-lab-production-home.png`、`xju-lab-production-login.png`。生产完整登录需要本人密码/MFA与实名资料，本轮未替代本人登录。服务器私有检查脚本及日志在 `~/.local/state/xju-lab-tools/`，不含打印出的秘密值；生产凭据仅留受限 `.env`。

### SSH 服务器管理增量（隔离验收通过）

- 已实现管理员连接弹窗、服务端 SSH config 自动解析、ProxyJump、按主机请求密码、专用公钥安装与重新认证、硬件快照、鲜绿色成功动画、保存和版本化删除。服务器页拆至 `features/servers`，复用 ComboBox 与 Radix Dialog。
- `5702a17` 的 [七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36700248167)：frontend / backend / verify-script / printer-agent / backup-restore / ssh-onboarding / browser-e2e。前端类型生成无漂移、考核 17 项和工位回归通过；数据库真实 PostgreSQL 迁移至 V8，新增权限/归属、密码不落库、取消、重启恢复、并发幂等保存与删除版本检查通过。
- SSH worker 5 项测试通过：含真实 OpenSSH 两台隔离容器，错误密码、跳板/目标指纹、首次公钥安装、独立进程重启后免密和重复安装无重复公钥；GPU 型号分支使用受控探测输出测试，真实 GPU 尚未联调。
- 浏览器两个端到端用例通过，共 52.2 秒；其中 SSH 连接/保存/刷新/删除/再次免密添加 13.5 秒。375/768/1440 px 弹窗边界、内部无横向裁切、ComboBox 模态交互和成功截图通过，截图已逐一人工查看。CI `browser-evidence` artifact 下 `api-mode-administrator-SSH-cc293--password-free-reconnection/ssh-success-{375,768,1440}.png` 可复查（保留 7 天）；本机复核目录 `C:\Users\genev\AppData\Local\Temp\xju-ssh-evidence-5702a17`。此前发现的密码辅助说明混入字段标签、窄屏尺寸过渡裁切与测试临时目录错误均已修复后重跑。
- Windows 隔离依赖目录也完成 TypeScript、Vite 构建、考核/工位回归及 Python 语法检查；本机 WSL 命令挂起，未改动 Linux 依赖目录，数据库和 SSH 系统验收使用上述 Linux CI。
- 部署配置、密钥持久化/撤销与生产缺项见 [SSH 接入说明](ssh-server-onboarding.md)。

| 包 | 目标 | 状态 |
|---|---|---|
| B00 | 工程、契约、数据库和 CI 基座 | 本地实现；契约漂移、配置、CI 通过 |
| B01 | OIDC、成员、角色与设置 | 本地 Keycloak 与双用户隔离、`iss + sub`、CSRF、停用/恢复、邮箱准入、实名/唯一学号、班级年级、方向多选、业务门禁和管理员更正通过；生产 Authentik/确切管理员引导已配置，真实完整登录与成员核验待完成 |
| B02 | 工位、布局版本与分配历史 | 确认的 31 可坐位布局保留；并发为同一成员分配两个工位时仅一个成功；导出通过；真实名册待导入 |
| B03 | 项目、统一任务、会议与总览 | 双成员可见范围通过；会议行动项完成后个人待办、会议和项目视图状态一致，并验证过期版本冲突 |
| B04 | 站内请假审批 | 非法/重叠、自批、半开区间与竞态通过；审批与撤回并发时仅一项转换成功；生产 SMTP 待验证 |
| B05 | 通知和邮件 | 通知/outbox 本地验证通过；打印专用文件 API 已移除；生产 SMTP 465 SSL 连接与认证通过，实际邮件投递待验证 |
| B06 | 服务端考核与管理 | 理论成绩/历史排名/发布通过；计分边界测试通过，OJ 双系统待联调 |
| B07 | 打印机状态 API | 已按最新要求删除任务提交、队列、文件绑定和打印 API，仅保留登记与状态读取 |
| B08 | Printer Agent 状态 | Python Agent、浏览器心跳/在线状态、只读 CUPS 状态链路通过；旧打印取件/任务 API 不存在并由隔离 API 检查确认；真实设备待接入 |
| B09 | 服务器监控与告警 | 安全固定查询与单测通过；生产 Prometheus/exporter 待接入 |
| B10 | OJ 导入与来源角色同步 | LabOS 连接器/outbox 已实现；OJ 端接口缺失，契约已记录，未改相邻仓库 |
| B11 | 公开展示、PWA、前端收尾 | 13 路由三视口无溢出、键盘/Esc/焦点、PWA 静态缓存、空/错/加载/无权状态和 CSV/SVG/PNG 浏览器检查通过；屏幕阅读器/真实设备辅助检查待人工 |
| B12 | 全栈验证、运维和交付 | 2026-09-30 主分支七项 CI 通过；huawei2 已执行部署成功，公网与数据库/Redis健康、OIDC 跳转和 SMTP 认证通过；真实完整登录、邮件投递、硬件/OJ 与生产灾备待验收 |

具体范围和退出条件见 [06 计划](plan/06-backend-completion.md)。以下列明本轮验收证据与尚未完成项；外部待验证项见[集成状态](integration-status.md)。

## 2026-09-30：实名注册、打印机状态与全栈交付验收

- 主分支代码提交 `92e2029` 的 [GitHub Actions](https://github.com/xju-arlab/xju-lab/actions/runs/36694354217) 六个 job 全部通过：前端 OpenAPI 类型/构建/回归、Java 21 + PostgreSQL 后端集成、统一验证脚本、Python Printer Agent、备份恢复和完整 OIDC 浏览器闭环。
- 浏览器闭环使用隔离 Keycloak 合成账户，覆盖管理员和两名成员登录、未登记实名流程、姓名/学号/班级与多方向登记、对象权限隔离、响应式路由、工位下载、会议/请假/考核与公开发布；成员资料按服务端规则保护。浏览器测试同时确认旧打印取件和打印任务接口返回 404。
- Service Worker 首次接管不再强制刷新正在填写的页面；只在用户选择“更新并重新载入”后刷新。E2E 等待 OIDC 会话解析后再选择登记或总览路径，避免异步登录判断跳过登记。
- 打印范围已收敛为管理员设备登记、Agent 凭据、只读 CUPS 状态和耗材/在线心跳；已无打印页、PDF 提交、任务队列、下载或执行接口。历史 Flyway 迁移中的旧表保留用于数据兼容，但当前代码不再读写它们。
- huawei2 仓库路径为 `/home/winbeau/projects/xju-lab`，部署命令为 `cd /home/winbeau/projects/xju-lab && ./deploy.sh`；`lab.icthub.top` 上游为 `http://127.0.0.1:18080`。主线更新和部署预检结果已核对；未提供生产 `.env`，所以应用未启动，域名/TLS 路由也未宣称上线。
- 仍待真实环境完成：Authentik 自助注册与验证邮件、项目 OIDC client/secret、SMTP、生产数据库密钥、反向代理/TLS、成员名册核验、打印机状态 Agent 和 Prometheus/exporter 联调、完整业务数据恢复/RTO/RPO。详见 [集成状态](integration-status.md)。

## 2026-09-29：B00–B12 本地实施与验收补充

- 创建 Java 21 / Spring Boot 3.5.16 模块化后端、Flyway PostgreSQL 迁移、Redis 会话、结构化错误与 OpenAPI 契约；增加成员/角色、确认工位布局、项目/任务/会议、请假/outbox、私有文件/邮件、考核/OJ、打印队列、监控、公开快照等服务端模块。API 模式不回退演示数据。
- 保留已确认的 31 个可坐人工位布局和方向/年级配色；保留 ACM / 理论双 Tab、老成员逐场过滤重算、单场理论类型互斥与历史 25% / 本次 75% 规则。前后端共用计分向量。
- 创建独立 Python Agent（SQLite journal、CUPS/IPP、服务端租约与版本回报），Docker Compose / Nginx / 隔离 Keycloak realm、Prometheus 安全固定查询配置、GitHub Actions 和运行/备份说明。
- 本轮实际验证：前端 `pnpm build`（API 类型生成、TypeScript、Vite，1651 模块）通过；Printer Agent 通过 Python 3.12 `unittest` 5/5。隔离 CUPS 服务器/虚拟 IPP 设备收到一份 PDF，CUPS 状态为 `COMPLETED`，提交后移除了临时队列且确认原有队列仍在。
- 之前的 [CI](https://github.com/xju-arlab/xju-lab/actions/runs/36648285104)（HEAD `b1601a2`）已直接运行统一检查与 PostgreSQL/RustFS 探针恢复链路。随后为完成完整前端/API验收，增加隔离 Keycloak 和端到端工作流。
- 首轮全栈 [CI](https://github.com/xju-arlab/xju-lab/actions/runs/36665041393)（HEAD `1319c1b`）全部 6 个 job 通过：前端 OpenAPI 类型漂移、build、assessment/seats；Java 21 `./mvnw -B verify`，PostgreSQL/Redis/RustFS Testcontainers、6 个 Flyway 迁移、29 项后端测试；统一 `scripts/verify.sh`；Python 3.12 Agent 5/5；Compose 配置；以及 Compose API/Web/Keycloak/数据服务干净启动和浏览器测试。浏览器使用本地 Keycloak 合成账户，覆盖管理员/两名成员 OIDC cookie 登录、项目/任务隔离、会议纪要/行动项、请假审批/通知、理论成绩/历史排行、私有 PDF/Agent heartbeat-poll-download-status、匿名公开快照发布/撤回。
- 完成验收复核后，在真实 PostgreSQL 集成测试中补充 `iss + sub` 冲突、成员停用/恢复及 CSRF、双工位分配竞态、请假审批/撤回竞态；扩展行动项完成后的个人待办/会议/项目状态一致性检查。代码提交 `163f79a` 的 [CI](https://github.com/xju-arlab/xju-lab/actions/runs/36669375197) 全部 6 个 job 通过，Java 21 `./mvnw -B verify` 共 33 项后端测试通过。
- 13 个已接入 API 页面逐一在 375/768/1440 px 检查页面级横向溢出；移动导航 Enter/Esc 和焦点保持通过。Service Worker cache 仅含离线页与 hash 静态资源；注入的 503 验证加载提示、错误态无假统计及重试恢复；成员空项目/无权页面通过。CSV 成绩姓名/分数、工位 SVG 结构和 PNG 文件签名均核验。屏幕阅读器/真实设备辅助功能未在 CI 检查。容量 smoke 为 100 条合成记录；50 个并发 `GET /api/v1/members?page=1&pageSize=100` 来自同一登录 browser session，另有 10 次仪表盘加载。GitHub-hosted Ubuntu 24.04/Compose/Chromium 样本：API p95 417 ms、dashboard p95 171 ms；单次 smoke guardrail 为 1000 ms，不是多会话或生产硬件 SLO。
- CI 同时以 PostgreSQL 17.6/RustFS 运行备份/恢复脚本，验证隔离探针行、对象 key/字节和目标桶陈旧对象清理（job 43 秒）；不等于完整业务库/生产一致性、RTO/RPO 或异地灾备。Windows 本机 Docker engine 不可用，因此未在本机启动容器；容器和浏览器验收由 GitHub-hosted runner 完成。
- 生产/外部待项：OJ 接口和授权同步、Authentik、真实名单、SMTP 投递、生产 S3/TLS、Prometheus/exporter、Raspberry Pi/实物打印、目标 DNS/TLS/资源限制、完整数据灾备与生产发布。详见 `docs/integration-status.md` 和 `docs/acceptance.md`。

## 前端基线

| 步骤 | 状态 | 已有内容 | 仍需处理 |
|---|---|---|---|
| F01 公共样式与总览 | **已完成** | 全局样式、Shell、总览、导航、响应式、统一自定义下拉、品牌图 | 后续只做反馈驱动的视觉修正 |
| F02 结构与状态 | **部分完成** | 公共 `ComboBox` 已抽出；工位、考核分别位于 `features/seats/`、`features/assessment/` | 其余页面、路由、演示状态仍集中在 `App.tsx`，需继续拆分 |
| F03 项目与待办 | 原型已实现，待专项验收 | 搜索、筛选、新建项目、详情、任务操作 | 继续验收边界校验与跨路由状态 |
| F04 工位 | **现场标定与前端交互已实现并验证** | 单一确认布局、网格吸附标定、气泡成员信息/分配、两种方向色/三种年级色、保存与导出；后续导出 Blob/像素和保存产物已检查 | 真实成员、跨设备布局和分配数据待 B02；最终全栈重新核验用户下载产物 |
| F05 请假 | 原型已实现，待专项验收 | 申请、演示审批、撤回、时间和重叠校验 | 权限、冲突校验和审批由服务端落实 |
| F06 打印 | 已退役 | 打印页面、文件提交和任务队列已删除；只保留打印机状态面板和状态 Agent | 不恢复打印任务或文件流程；真实设备状态待联调 |
| F07 监控/考核 | **考核专项已实现并验证；监控待专项验收** | ACM / 深度学习双 Tab、统一双排行、单场形式、链接导入交互、成员过滤、成绩录入/明细、本地保存、CSV 导出；新增 CPU 部署服务器占位 | CPU 服务器型号/核心数/内存/磁盘尚未录入；使用演示成绩；真实 OJ 与监控 API 待接入 |
| F08 其余页面 | 原型已实现，部分已保存 | 会议、主页、设置、个人资料；设置和资料保存在当前浏览器 | 会议及其他演示业务状态未统一持久化；认证、通知待接入 |
| F09 整体评审 | 部分完成 | 桌面/移动路由与关键交互抽查；考核有桌面截图和 375 px 验证 | 全面键盘/无障碍与异常状态审查；其他模块证据待补 |
| F10 后端接入准备 | B00–B12 已完成 | 契约、服务端、真实 API 前端、Agent、部署和 CI 验收已交付 | 仅继续真实外部集成与生产验收，不重启脚手架阶段 |

## 2026-09-29：公开仓库与完整开发交接

- 用户要求用 gh CLI 在 `xju-arlab` 创建公开 `xju-lab`，提交当前前端与文档，并为 Luna 新对话准备一次提示词连续开发入口。
- 新增根 `README.md`、`AGENTS.md`、`docs/plan/06-backend-completion.md`；重写交接、文档/概要索引和路线图，更新前后端 README、决策、验收、API 占位说明与设计状态。
- 清理当前入口里“缺 CSS / 构建失败 / 只做前端 / 每轮一步”的过时描述；保留历史记录。计划覆盖 R01–R12、B00–B12、权限/数据约束、外部缺项和真实完成口径；后端本轮未实现。
- 扩展 `.gitignore`，排除环境秘密、私钥、运行数据库、导出/备份、Agent Python 缓存，允许提交环境配置示例。
- 添加 `.gitattributes`，统一 Git 中的文本 LF 换行，避免 Windows/WSL 混用产生整文件差异；仅清理原始需求归档的一行空白，不改变历史内容或业务代码。
- 实测环境：WSL Ubuntu-22.04、Node 24.16.0、pnpm 10.17.1。`pnpm build` 通过（1648 模块），`pnpm test:assessment` 16/16，`pnpm test:seats` 通过；未改 UI 或业务代码，本轮没有重新执行浏览器全路由验收。
- 已通过 gh CLI 创建公开仓库 [xju-arlab/xju-lab](https://github.com/xju-arlab/xju-lab)，配置 origin；本次版本作为前端原型与完整开发计划基线。公开文件的本地 Markdown 链接检查通过；敏感模式检查仅命中 OJ URL 拒绝测试中的虚构 user/pass，已人工核实。
- 下一项为 B00；真实外部集成未验证，不据本轮文档准备声称后端或部署完成。提交与远端状态可通过 Git 核对，发布结果在本次交付回复记录。

## 2026-09-29：CPU 部署服务器资源占位

- 计算资源页新增“CPU 部署服务器”，总览资源栏同步展示；使用统一服务器卡片样式。
- 设备参数与利用率未知时显示“待录入/待接入”，不伪造 CPU 型号、核心数、内存容量、磁盘容量或监控数值。
- GPU 数量及空闲数只汇总 GPU 节点；“已登记内存”只累计已登记节点，CPU 占位不计入未知容量。
- `pnpm build` 通过（TypeScript + Vite，1648 个模块）。浏览器确认资源页显示 4 台节点、16 块 GPU（空闲 9 块）、CPU 部署节点待录入；375 px 下文档宽度为 375 px，4 张资源卡正常呈现且无横向溢出。
- 后端未修改；资源契约继续使用 `frontend/src/api/contracts.ts` 的 compute 占位接口。

## 2026-09-29：导出四边等距留白

- 原因：导出复制了页面非对称 viewBox，又固定输出 1400 × 1060，比例不一致；背景未覆盖新范围会留下透明边。改为复制实际图形、清除编辑/选中/过滤态，测量含描边的边界后四边统一增加 40 单位。
- SVG 使用裁切范围本身的宽高与 viewBox，背景铺满；PNG 以相同比例 2 倍输出，并先填充不透明底色。页面显示和标定坐标不变。
- 浏览器真实产物检查：确认布局 SVG 为 1053 × 940、viewBox `45 45 1053 940`；PNG 为 2106 × 1880，左/上/右/下均为 80 px，透明像素为 0。将 A01 移到墙外并旋转后，PNG 2403 × 2206，四边仍均为 80 px，图形未截断。测试页面不会保存修改。
- 增加 `/tests/seat-export-preview.html` 开发检查页，验证实际导出 Blob 的像素、背景、选择框和过滤态清理。产物直接保存为 `C:/Users/genev/.codex/visualizations/2026/09/29/01a0edee-7c27-7571-864d-4673b741d7ec/seats-even-padding.png` 及同名 `.svg`。
- `pnpm build`、`pnpm test:seats` 均通过；页面 PNG 导出入口已触发。未更改布局、成员分配、服务器或部署。

## 2026-09-29：工位页文案、胶囊与滚动修正

- 删除“文字 / 年级”、“打印机 · 娱乐区 · 工具区”、墙外入口/窗户/门窗方向、图名与标定/非测量图等可见说明，保留三种年级图例、设施图形和标定工具。
- 位置标签移到标题旁，工位标定开关放到同一行最右侧，统一中性色、边框与胶囊造型。桌面高度均为 34 px，手机均为 32 px；375 px 下仍在同一行。
- SVG/PNG 两个导出按钮均有下载图标，实测均为 57.5 × 30 px。同步重新生成静态 SVG。
- 滚动根因是画布的 `overscroll-behavior: contain` 阻断纵向滚动传递，改为仅横向 contain、纵向 auto。鼠标位于地图上向下滚动时，页面 scrollTop 从 0 到 286，地图内部纵向位置仍为 0；手机上图中向上滚动回到页面顶部。移动页面无横向溢出，已恢复默认桌面视口。
- `pnpm build`、`pnpm test:seats`、`pnpm export:floor-plan` 均通过。最终截图：`C:/Users/genev/.codex/visualizations/2026/09/29/01a0edee-7c27-7571-864d-4673b741d7ec/seats-clean-layout.png`。未改动标定坐标、成员分配或后端。

## 2026-09-29：确认工位布局、标定与成员气泡

- 采用独立编辑器最终保存于 `2026-09-29T18:20:45.961Z` 的标定，原始文件备份为 `docs/design/lab-layout-calibrated.json`；整理结果固化为 `frontend/src/features/seats/layout.confirmed.json`。
- 统一每排间距与纵坐标、B/C 和 D/E 成对列、G/H 纵列及窗墙。保留 B/C 130%、D/E 95%、工具区与 A01 桌面上下沿对齐、娱乐桌与 D/E 桌面外沿对齐且无椅子、左上墙体和两扇向左的门（上扇关闭），无图书角。
- 工位页沿用项目外观，删除空间布局/分配展示页签，只留一个默认平面。工位标定开关在标题右侧同行，始终启用 10 单位位移吸附，支持整排/组合选择、尺寸朝向、墙窗控制、撤销重做、保存取消、恢复标定、JSON 导入导出。
- 点击工位显示带三角的一体圆角气泡。未分配可用 ComboBox 选择未占工位的成员；已分配显示姓名、班级、学号、联系方式和方向，可解除分配。维护、打印机与娱乐桌不接受分配。
- 按用户最后补充，方向仅算法（蓝）/深度学习（紫），双方向渐变；年级仅 24–26 级，文字绿/橙/玫红，五种语义颜色区分。编号和姓名加粗；气泡头像旁只留姓名并垂直居中。旧示例方向/23 级缓存回退至修正 roster，保留分配。
- 布局与分配分别存当前浏览器 `xju-lab.seat-layout.v1`、`xju-lab.seat-assignments.v1`；坏数据校验回退。当前成员仍是示例，未填写学号和联系方式。后端没有修改，仅登记未来接口建议。
- `pnpm build` 通过（TypeScript + Vite，1648 模块）；`pnpm test:seats` 通过，覆盖原始标定来源、对齐幂等、桌面边界、组合吸附、墙窗约束、序列化校验、分配限制、五种配色、旧数据兼容、SVG 31 张座椅；现有 `pnpm test:assessment` 16 项通过。
- 浏览器验证：A01 双方向渐变和成员字段；B01 分配何新雨后刷新保留，再解除恢复；A01 拖动与 B+C 整排方向键吸附、撤销；工具区 X 从 180 调到 190 保存刷新保留，再恢复最终标定；取消临时修改后恢复 180。测试变更均已复原。
- 375 × 812 下文档宽 360（另有滚动条），地图在内部横向滚动，气泡及 ComboBox 未溢出。修复气泡忽略滚动条宽度和 Esc 同时关闭菜单/气泡的问题。已恢复默认桌面视口。
- 最后实际核对气泡姓名/头像中心相差不足 0.01 px；DOM 只显示两个方向和三个年级，编号和姓名 font-weight=700；浏览器未见 error 日志。
- `pnpm export:floor-plan` 成功生成更新后的 `frontend/public/lab-floor-plan.svg`；页面 PNG 生成反馈通过。自动化下载事件未返回文件路径，未验证浏览器下载后的文件内容，不将其列为已通过的文件验收。
- 预览保留：<http://127.0.0.1:5173/app/seats>。最终截图：`C:/Users/genev/.codex/visualizations/2026/09/29/01a0edee-7c27-7571-864d-4673b741d7ec/seats-confirmed-final.png`。独立编辑器未移除。
- 设计与接入说明：[12 工位布局与交互](design/12-seat-layout.md)。本轮未提交、推送或部署；下一步可继续其他前端模块，真实成员和权限持久化待后端。

## 实验室资料与默认值

- 实验室名称默认“算法与科研实验室”，位置默认“信息楼A411”，个人姓名默认“赵文彪”。
- 名称、位置、时区和简介在“管理与设置”修改并保存；姓名、研究方向和介绍在“个人资料”修改并保存。
- 前端原型将实验室设置和个人资料存入浏览器 `localStorage`，刷新后仍保留。此保存只对当前浏览器有效；服务端持久化留待 API 接入。
- 已将旧默认位置“信息楼 A411”迁移为用户指定的“信息楼A411”；其他自定义位置保留。

## 2026-09-29：统一两种排行、OJ 链接导入与角色联动计划

- 用户最新要求：两个方向展示对齐，均有“本次排名 / 历史排名”；每场理论考试只能是笔试或机试；算法页导入成绩只需粘贴 OJ 链接；设置实验室超级管理员同时设置同账号的 OJ 管理员。
- 页面共用 `RankingTabs`。理论增加独立本次名次，当前榜按本场分数排序并显示分项，历史榜按 25% / 75% 综合分排序；导出标明视图、本次名次和综合名次，避免混用。
- 移除理论“全部/笔试/机试”筛选按钮，改为所选场次的只读“本场形式”；类型仍是必填单值枚举，历史继续合并培养期内此前两类考试。
- 新增 `OjImportDialog.tsx` 和 `ojImport.ts`：唯一必填项是比赛链接；校验 HTTPS、来源域名、路径和比赛 ID，将比赛主页/排行榜分页链接统一为比赛本身。正确链接显示已识别且尚未接入后端，不发网络请求，不生成导入成绩。
- 新增 [11 OJ 导入与管理员同步后端计划](design/11-oj-import-and-admin-sync.md)，同步更新索引、架构、需求、路线图、决策、接口占位、验收和交接；backend/README.md 仅增加设计入口。
- 只读盘点 OJ，确认 `_apply_admin_claims` 目前会覆盖手动角色，普通 Admin 也不等于全部比赛管理员；计划采用独立 LabOS 来源授权、统一角色合并、outbox、版本幂等、撤销和租期对账，目标默认 OJ Admin。未修改 OJ 或任何生产角色。
- `pnpm test:assessment`：16 项通过，新增本次/历史排序独立、零分与并列、链接归一化及错误来源测试。
- `pnpm build`：最终通过（TypeScript + Vite，1647 模块）。首次执行时工位模块引用 row.y 的类型错误导致失败；检测到该文件随后在工作区更新，重新执行已通过。本轮未修改工位代码。
- 浏览器：理论当前榜周亦辰与王清和同为 85.85、并列第 3；历史综合榜分别 84.19 / 83.10、排名 3 / 4。切换到机试只显示机试形式，历史均分仍包含此前两类场次。两方向都可切换两种排行。
- 导入交互：拒绝 example.com 链接；接受 OJ contest/13/rank?page=2 并识别整场 13，显示尚未导入。弹窗仅一个输入，Esc 可关闭；没有修改现有成绩。
- 375 × 812：理论两榜和 ACM 页面文档宽 360 px（另有视口滚动条），表格内部横向滚动；导入弹窗完整可操作，完成后已恢复默认桌面。浏览器无 error 日志。
- 截图证据：`C:/Users/genev/.codex/visualizations/2026/09/29/01a0ed67-fe0e-7111-9f54-8ef5d339b196/assessment-theory-history.png`、同目录 `assessment-oj-import.png`。预览保留在 <http://127.0.0.1:5173/app/assessment?tab=theory>。
- 本步结论：前端展示/交互与后端计划已更新；真实 OJ 导入、角色同步和考试管理仍待后端实施。CSV 文件落盘内容沿用上一轮未核验的限制，本轮不新增下载成功声明。

## 此前：成长与考核双 Tab

- 用户确认：第一 Tab ACM 算法，第二 Tab 深度学习理论基础；老成员按标记过滤并重算当次和历史各场；理论历史均分合并同一培养期的笔试/机试，每次百分制，历史 25% + 当次 75%。
- 新增 `frontend/src/features/assessment/` 的类型、虚构数据、计分纯函数、成绩录入、页面和模块样式；替换 App 中旧的目标/证据原型并移除其无用数据。复用已有 Button、Dialog、ComboBox 和飞跃样式。
- ACM 建议算法：每场排名转换为 `100 × (N − r) / (N − 1)`，并列取平均占位名次，单人取 50；同培养期历史均值 25% + 当次 75%。无历史回退当次；无当次不排名。过滤成员与姓名搜索的作用明确分离。
- 理论成绩支持总分/分项、待评分/缺考/免考/有效零分、评语、历史明细与综合排行。成绩覆盖值及成员分组使用 `xju-lab.assessment.v2` 本地保存；未发送真实服务请求。
- 更新需求、路线图、决策、验收、API 占位和交接，新增 [09 详细设计](design/09-assessment-and-showcase.md)，清理索引中已失效的“缺 CSS/F01 未完成”说明。
- 构建：`pnpm build` 通过，含 TypeScript 检查与 Vite production build（1640 模块）。计分测试：`pnpm test:assessment`，12 项全部通过。
- 浏览器：复用 5173，验证 Tab 鼠标/方向键切换、当次/历史综合视图、老成员过滤、搜索不改变排名、理论类型筛选仍合并历史、个人明细、规则弹窗 Esc 关闭。
- 浏览器数据核对：林予宁过滤后当次 1/9、历史均分 91.67、综合 97.92；显示全体后当次 2/12、历史均分 62.78、综合 83.88，证明两部分都重算。
- 录入核对：将演示待评分成员临时录入 0 分，历史 70.98、综合 17.75，刷新仍保留；完成后已恢复该成员原来的待评分状态。空总分不能提交。
- 响应式：375 × 812 检查两个 Tab；修复 ACM 隐藏表头绝对定位导致的整页溢出。修复后 ACM 当次/历史视图的文档宽 360 px（加滚动条为 375 px 视口），表格内部横向滚动；理论页同样无整页横向溢出。已恢复默认桌面尺寸。
- 日志：未见页面运行错误；有现有 React Router v7 迁移提示。本轮不升级路由库。
- CSV 已实现并触发导出；浏览器自动化等待下载事件超时，尚未核验落盘 CSV 文件，不能将文件内容验收标为通过。
- 桌面完整截图：`C:/Users/genev/.codex/visualizations/2026/09/29/01a0ed67-fe0e-7111-9f54-8ef5d339b196/assessment-acm.png`、同目录 `assessment-theory.png`。预览保持打开：<http://127.0.0.1:5173/app/assessment?tab=theory>。
- 本步结论：考核前端及计分规则可评审。真实成绩/OJ 同步、考试管理、权限与服务端持久化尚未实现；继续 F02 和其余前端专项，不改后端。

## 此前：资料默认值与交接更新

- 更新 `frontend/src/App.tsx`：默认位置改为“信息楼A411”，迁移旧的带空格默认值；其他用户自定义位置继续沿用。个人资料的工位标签改为读取工位分配数据，不再写死为 A01；删去个人资料页多余说明。
- 更新 `docs/HANDOFF.md`、`docs/plan/05-frontend-steps.md` 和本文件：去除过时的“F01 阻塞、globals.css 缺失”记录，写入真实完成状态和下一步。
- 设置与资料持久化方式记录在 `docs/api-placeholders.md`；API 路径仍是建议占位，未请求后端。
- 开发服务已存在于 5173 端口，复用，不启动重复实例。
- `pnpm build`：通过（含 `tsc --noEmit` 与 Vite production build，1635 个模块转换；最后一次构建完成于资料页调整之后）。
- 浏览器：复用现有 5173 服务；总览页、入口模块和全局 CSS 均 HTTP 200；总览页面可正常呈现，资料标签显示“算法与科研实验室 / 信息楼A411 / 赵文彪”。
- 移动布局：375 × 812 viewport 检查，`document.documentElement.scrollWidth === 375`；完成后清除临时设备尺寸覆盖。桌面预览已恢复并保持打开：<http://127.0.0.1:5173/app/dashboard>。
- 持久化：重载后读取浏览器 `localStorage`，实验室位置仍为“信息楼A411”；此前已在界面验证设置与个人资料的编辑保存。
- 后端：未修改。测试套件：未运行；本轮执行构建和浏览器界面核验。

## 后续记录模板

```text
日期 / 步骤：
本轮范围：
实际修改：
typecheck / build：
浏览器验证（地址、宽度、关键操作）：
截图/证据路径：
未完成或限制：
本步结论：完成 / 部分完成 / 阻塞
下一步：
```
