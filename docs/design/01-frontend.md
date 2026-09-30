# 01 前端风格、复用与页面设计

[返回详细设计](README.md) · [源码依据](../references/README.md)

> 本文描述设计目标。当前全局样式已补齐，前端主要页面和考核/工位专项已实现，构建与现有测试通过；全路由边界仍随[完整开发计划](../plan/06-backend-completion.md)补齐。实际完成证据见[进度记录](../progress.md)。

## 1. 风格基线

参考的是 `xju-feiyue/frontend/src` 的实际实现，重点为 `styles/tokens.css`、`globals.css`、`prose-claude.css`、`components/ui`、`components/layout` 和业务组件。`archive/design-refs` 只作历史参考，`site/index.html` 是发展历程页，不是内部应用风格基线。

设计目标：白色主画布、暖灰次级区域、细边框、克制阴影；衬线标题与无衬线操作文字；彩色只用于业务状态、标签和图表。LabOS 名称与导航替换飞跃品牌文案，视觉语言延续原工程。

| 项目 | 飞跃实际值 | LabOS 使用规则 |
|---|---|---|
| 主背景 | `--color-bg: #ffffff` | 页面、卡片主体 |
| 次级背景 | `--color-bg-subtle: #f7f6f3` | 侧栏、筛选区、摘要区 |
| hover | `--bg-hover: #f1f1ef` | 表格/导航悬停 |
| 正文 | `--color-text: #37352f` | 标题和正文 |
| 次级文字 | `--color-text-muted: #787774` | 标签；小字需验对比度 |
| 辅助文字 | `--color-text-faint: #9b9a97` | 非关键装饰；不可作为关键状态唯一文本 |
| 边框 | `#edece9` / `#dcdad4` | 分隔与强调边界 |
| 链接 | `#2383e2` | 文本链接；主按钮沿用深文字色底 |
| 圆角 | 6 / 8 / 12 px | 小控件 / 表单与普通卡 / 大卡；不机械使用 Tailwind 默认同名值 |
| 阴影 | `0 1px 2px rgba(0,0,0,.04)` | 仅必要浮层/卡片 |
| 动效 | `150ms ease` | focus/hover；尊重 reduced-motion |
| 正文字体 | Inter Tight、PingFang SC、系统 sans | 默认 15 px、1.5 行高；补中文系统回退 |
| 标题字体 | Source Serif 4、Noto Serif SC、Georgia | 页标题建议 28 px，正文区分层 |
| 数字/代码 | JetBrains Mono / 系统 mono | 作业号、容量、日志、tabular-nums |

`globals.css` 中 shadcn HSL 桥接与 `tokens.css` 必须同步迁移，不能只复制 hex。飞跃外部 Google Fonts 引入不照搬；先使用回退字体，后续确认许可后按需自托管，避免校园网络字体依赖。暂不承诺暗色模式。

新增语义变量 `--status-success/warning/danger/info/unknown`，分别映射飞跃绿、橙、红、蓝、灰。工位使用文字“已分配/空闲/请假/临时/维护”及图例；服务器高负载不自动等于红色故障。

## 2. 可复用清单

下表源路径都相对 `../xju-feiyue/frontend/src/`，目标相对 `frontend/src/`。已迁入 `tokens.css`、Tailwind 配置、`cn.ts`、Button、Dialog，许可见 `frontend/THIRD_PARTY_NOTICES.md`；其余是复用计划，尚未迁入或验收。

| 源文件/目录 | 复用级别 | 目标与必要改造 |
|---|---|---|
| `styles/tokens.css`、`tailwind.config.ts` | 抽取基础变量与映射 | 保留中性色、排版、尺寸；去除导师页/AI diff 专属变量，增加 LabOS 语义别名 |
| `styles/globals.css` | 拆分复用 | 只迁移 reset、HSL 桥、scrollbar；不整体迁入学校/会议/Office 样式 |
| `styles/prose-claude.css` | 按需复用 | 会议纪要、项目更新、展示正文，限制样式作用域 |
| `lib/cn.ts`、`components/ui/*` | 基础组件优先迁移 | Button/Input/Dialog/Sheet/Tabs/Badge/Avatar 等；携带实际用到的 Radix 依赖 |
| `components/common/{EmptyState,ErrorState,LoadingSkeleton}.tsx` | 轻改复用 | 统一加载/空态/错误/重试，与新错误契约一致 |
| `features/admin/components/StatCard.tsx` | 轻改复用 | `components/common/StatCard.tsx`，总览摘要；明确加载/未知值 |
| `components/layout/{AppShell,Header,Footer}.tsx` | 结构改造 | `PublicShell`/`AppShell`；替换路由、品牌、账户菜单、搜索语义 |
| `features/auth/BrandPanel.tsx` | 视觉片段复用 | `/login` 品牌区保留排版，按钮转统一登录，删除本地密码输入 |
| `features/schools/components/drawer/AdvisorDrawer.tsx` | 交互模式复用 | 工位成员/设备详情 Sheet，重写数据与字段访问控制 |
| `features/class/components/gantt/*`、`features/class/lib/gantt.ts` | 适配后复用 | 项目时间线；`GroupTask` 换 LabOS Task；`sid` 换 userId；日期校验和业务时区重写 |
| `features/class/components/group-space/*` | 结构参考 | 项目详情头、成员栈、文件列表；不迁移班级权限与接口 |
| `components/common/FilePreviewDialog.tsx`、`preview/PdfViewer.tsx` | 适配后复用 | 文件/打印预览；输入 fileId + 授权 URL；仅先装 PDF viewer，其他格式后续按需 |
| `components/common/Markdown.tsx`、`CodeBlock.tsx` | 修订后复用 | 默认禁用原始 HTML；需要 HTML 时加入审查过的 sanitize 白名单；授权附件路径重新适配 |
| `api/client.ts`、`api/endpoints`、`api/schemas` 模式 | 结构复用、实现重写 | `/api/v1`、Cookie、CSRF、Problem JSON、重复 query、取消请求、超时 |
| `pages/_dev/DesignSystemPage.tsx` | 改造复用 | 新 `/dev/design-system`，开发态验证 token/组件/业务状态 |
| `stores/authStore.ts`、`RequireAccess.tsx` | 不直接复制 | 新会话 bootstrap、角色/资源能力、禁止持久化凭据 |
| AI 编辑、学分/OJ/学校/会议业务、mock 账号 | 不迁入 | 与 LabOS 范围无关 |

已读代码显示两处具体适配风险：旧 client 面向 FastAPI `{detail}`，且 query 写入处使用 `set` 会覆盖同名多值；旧 auth store 将 token 存 localStorage。LabOS 必须按新契约改造。Markdown 现有 `rehypeRaw` 也不能直接用于内部敏感内容。

### 迁移步骤

1. A0 记录源 commit 和实际文件 hash，保留 MIT 许可声明，在后续 `THIRD_PARTY_NOTICES.md` 登记迁入内容。
2. 先复制最小 token、`cn`、必要 UI、公共状态；删除无关业务耦合。
3. 构建登录入口、总览卡、表格、详情 Sheet、工位卡和确认弹窗六个样板，做桌面/移动截图。
4. 接新接口后迁甘特图与预览组件，同时带入相关原有测试，再补新边界用例。
5. 首版使用仓库内可追溯副本，不让构建依赖 `../xju-feiyue` 的相对 import/软链接；两产品稳定后再考虑公共组件包。

## 3. 布局与导航

公开站沿用飞跃 Header + 内容区 + Footer，阅读宽度约 1024 px。内部新增 224 px 可折叠暖灰侧栏、56 px 顶栏，工作区最大约 1440 px；这是适应管理模块数量的布局调整，不假称飞跃已有该侧栏。

```text
┌ 顶栏：LabOS / 当前页面                    通知  账户 ┐
│ 总览    │ 页标题 / 说明                  主操作按钮 │
│ 工位    │ 筛选与统计摘要                            │
│ 项目    │                                          │
│ 会议    │ 业务主体：平面图 / 列表 / 内容             │
│ 请假    │                                          │
│ 打印    │                        右侧详情（按需）    │
│ 考核    │                                          │
│ 服务器  │                                          │
│ 管理    │                                          │
└─────────┴──────────────────────────────────────────┘
```

375–767 px：侧栏变 Sheet，统计卡单列，筛选折叠；表格优先卡片化，确有必要的表格局部横滚；工位图可缩放并提供列表替代。768–1199 px：导航可折叠、卡片两列。1200 px 起：常驻侧栏、摘要最多四列。弹窗管理焦点、Esc 和返回触发点；触控目标建议至少 44 px。

## 4. 路由与页面清单

| 路由 | 页面结构及主要动作 | 阶段 |
|---|---|---|
| `/login` | 实验室品牌、统一登录按钮、登录失败说明、公共主页链接 | A0 |
| `/app/dashboard` | 工位/请假统计，我的项目/待办，最近会议，设备摘要 | A1+ |
| `/app/members`、`/app/members/:id` | 成员检索、公开内部资料、项目关系；联系方式按许可 | A1 |
| `/app/seats` | 房间切换、SVG、图例、列表替代、成员详情、管理分配 | A1 |
| `/app/projects`、`/app/projects/:id` | 列表/阶段筛选；概览、里程碑、任务/甘特、更新、文件 | A1/B |
| `/app/meetings`、`/app/meetings/:id` | 会议列表，议程、参会、纪要、行动项、项目关联 | A1 |
| `/app/leave` | 我的申请/待我审批，申请表、详情、操作历史 | A1 |
| `/approval/leave` | token 校验提示、统一登录、申请详情、确认决定 | B |
| `/app/dashboard`、`/app/admin/settings` | 仪表盘打印机状态；管理员登记设备、轮换 Agent 凭据和启停设备 | 仅状态监控 |
| `/app/servers`、`/app/servers/:id` | 服务器卡、GPU 行、曲线、最近采集和异常说明 | D |
| `/app/assessment`、`/app/assessment?tab=theory` | ACM 算法 / 深度学习理论基础两个 Tab，比赛过滤与综合排行、笔试/机试成绩录入和历史明细；见[专项设计](09-assessment-and-showcase.md) | F07 原型 / E 接入 |
| `/app/notifications`、`/app/profile` | 通知、个人资料、统一账户设置链接 | B/A1 |
| `/app/admin/users`、`/app/admin/seats` | 准入/角色/导师关系；房间布局和工位管理 | A1 |
| `/app/admin/printers`、`/app/admin/servers` | 设备绑定、维护开关、能力/采集诊断 | C/D |
| `/app/admin/assessment`、`/app/admin/showcase` | 拟建：培养期/量规/成绩发布；内容草稿、发布/下架。当前考核演示录入与成员分组位于考核主页面 | E |
| `/app/admin/settings`、`/app/admin/audit` | 非敏感配置、通知/告警参数、审计检索 | A1+ |
| `/`、`/members`、`/research`、`/publications`、`/competitions`、`/projects`、`/news`、`/join` | 公开内容列表和 `/类型/:slug` 详情 | E |

## 5. 状态与交互

每页具备 skeleton、首次空态、筛选无结果、请求失败重试、无权限、数据过期状态。主操作 pending 时禁止重复点击，但幂等仍由后端保证。审批不乐观标记成功；普通任务编辑可乐观更新，版本冲突回滚并展示差异提示。

Query keys 含当前 userId 与过滤条件，退出/换用户清空 Query cache；Zustand 只保留导航/显示偏好，不保存 OIDC token、审批 token、请假原因或成员表。筛选/页码放 URL；草稿默认内存，离开未保存页面提示。

总览业务模块分别显示可用状态；打印/监控尚未启用时隐藏对应卡或显示管理员配置入口，不填静态“正常”。工位详情只显示当前请假标签，不显示原因。

## 6. PWA 与视觉验收

Service Worker 仅缓存带 hash 的静态资源和离线页；`/api`、OIDC、审批页、文件下载、用户数据 `NetworkOnly`/`no-store`。首版不做后台自动重试审批或打印。更新版本有提示，未提交表单不强制刷新；manifest scope 为 `/app/`，start URL `/app/dashboard`。

验收样板应覆盖上述六种组件场景和三种宽度，检查字体回退、长中文姓名、200% 缩放、键盘焦点、读屏标签、空态和错误态。工位图及曲线提供文本摘要，颜色不承担唯一语义。
