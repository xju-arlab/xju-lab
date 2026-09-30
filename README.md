# XJU Lab · 实验室协作平台

面向算法与科研实验室的成员、工位、项目、会议、请假、计算资源、成长考核和打印机状态管理平台，同时提供经审核的公开实验室主页。

**当前状态：B00–B12 本地实现与验收已完成，2026-09-30 主分支全栈 CI 六个作业通过。** 已验证邮箱自助注册、实名/唯一学号登记、班级解析年级、多选研究方向与角色约束；打印页、打印提交和任务队列已移除，仅保留设备登记、Agent 心跳和打印机状态。Lab 与 OJ 是同级应用，共用身份提供方但角色隔离。CI 覆盖 PostgreSQL 后端、前端构建与回归、OIDC 浏览器业务流程、Printer Agent、部署校验和隔离备份恢复。生产 Authentik 自助注册/验证邮件、项目 OIDC client/secret、SMTP、真实成员/设备、生产域名路由和部署仍待目标环境配置与联调。现有前端设计和确认过的业务规则已保留。逐包证据见[进度记录](docs/progress.md)与[集成状态](docs/integration-status.md)。

## 快速启动

管理员可通过 SSH config 和跳板连接添加服务器，自动安装专用公钥并识别硬件，连接成功后保存；支持版本化删除。[七项 CI 与三视口浏览器验收通过](https://github.com/xju-arlab/xju-lab/actions/runs/36700248167)，[配置、密钥与生产边界](docs/ssh-server-onboarding.md)见接入说明。

已验证环境：Node.js 24.16.0、pnpm 10.17.1。使用仓库锁文件安装，不混用 npm/yarn。

```bash
git clone https://github.com/xju-arlab/xju-lab.git
cd xju-lab/frontend
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 明确运行演示模式，打开 <http://localhost:5173/app/dashboard>。API 部署端口在 huawei2 上预期为 <http://127.0.0.1:18080/app/dashboard>；它只监听服务器回环地址，供反向代理使用，不能从个人电脑直接当作远程链接。后端和 API 模式的本地依赖步骤见[backend/README](backend/README.md)；API 请求失败不会回退到演示数据。

```bash
# 在 frontend/ 中执行
pnpm build
pnpm test:assessment
pnpm test:seats
```

`build` 包含 TypeScript 检查。以上三项已在 2026-09-29 通过；验收范围和历史浏览器证据见[进度记录](docs/progress.md)。

## 已有功能与接入范围

| 模块 | 本地实现 | 生产或外部待验证 |
|---|---|---|
| 总览、项目、待办、会议 | API 模式、统一任务、项目成员/里程碑、会议行动项 | 真实团队资料和组织策略 |
| 工位 | 确认布局、版本冲突、服务端分配与历史 | 真实名册导入 |
| 请假 | 服务端状态机、审批、时区/重叠校验、审计与 outbox | 正式 SMTP 投递 |
| 打印机状态 | 管理员登记设备及 Agent 凭据；只读 CUPS 状态采集；仪表盘在线/离线状态；无打印页或任务接口 | huawei2 生产配置、反向代理路由和真实设备状态联调 |
| 计算资源 | 管理员 SSH 添加/删除、跳板与公钥免密、硬件识别、固定指标 API、缺失/过期状态与告警 | 实验室 SSH 网络/账号/指纹与真实 GPU、Prometheus/exporter |
| 成长与考核 | 服务端计分/双排行/修订/CSV/发布快照；OJ 单链接任务 | OJ 目标端接口与双系统验证 |
| 成员、设置、展示 | OIDC 会话/API 模式、角色同步 outbox、显式公开快照、PWA | Authentik 生产配置、双账户验收与公开域名/TLS |

Lab 仅接受邮箱已验证的 `@icthub.top` 注册。注册时必须登记真实姓名、唯一学号、规范班级和至少一个研究方向；班级示例为 `计算机24-3`，年级自动解析。成员可自行修改班级/方向，姓名/学号只可由超级管理员更正。生产 Authentik 需要开启自助注册和邮箱验证。

默认实验室名称为“算法与科研实验室”，位置为“信息楼A411”。演示个人资料中的姓名不是管理员身份；后端不得据此授权。

## 目录与技术方向

```text
frontend/       React + TypeScript + Vite；Tailwind + shadcn/Radix
backend/        Java 21 + Spring Boot 模块化单体
printer-agent/  Python 出站心跳与只读 CUPS 状态采集
deploy/         Compose、Nginx、Keycloak 开发 realm、Prometheus 配置
docs/           需求、设计、执行计划、验收和交接记录
AGENTS.md       开发代理的入口、约束与验证要求
```

运行配置见 [backend/README](backend/README.md) 和 [`deploy/compose.yaml`](deploy/compose.yaml)；全栈 API 见 [`contracts/openapi.yaml`](contracts/openapi.yaml)。huawei2 部署命令为 `cd /home/winbeau/projects/xju-lab && ./deploy.sh`；`lab.icthub.top` 的反向代理服务目标应为 `http://127.0.0.1:18080`，生产公开 origin 为 `https://lab.icthub.top`。生产 `.env` 未配置前，部署脚本会停止在预检阶段。备份和回退约束见 [docs/operations.md](docs/operations.md)。

## 接续开发

先读 [AGENTS.md](AGENTS.md)、[交接入口](docs/HANDOFF.md)、[完整开发计划](docs/plan/06-backend-completion.md)和[验收标准](docs/acceptance.md)。计划覆盖全部 R01–R12，保留现有外观与工位标定，按 B00–B12 连续实施，不再受旧版“只做前端、每轮一步”限制。

新开 Luna 对话时使用[交接中的单句提示词](docs/HANDOFF.md#新对话提示词)。[文档索引](docs/README.md)列出专项规则和当前进度。

## 复用与公开内容

前端部分基础组件、样式和配置来自 `xju-feiyue`，MIT 许可副本与修改范围见[第三方说明](frontend/THIRD_PARTY_NOTICES.md)。本仓库尚未为其余代码指定独立开源许可证；公开可见不等同于为所有内容授予 MIT 许可。配置只提交示例，不提交真实凭据、成员资料、成绩导出、数据库备份或设备密钥。
