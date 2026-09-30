<div align="center">

<h1>XJU Lab</h1>
<p><strong>算法与科研实验室 · 成员协作与资源管理平台</strong></p>

[![CI](https://github.com/xju-arlab/xju-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/xju-arlab/xju-lab/actions/workflows/ci.yml)

![React 18](https://img.shields.io/badge/React-18-149ECA?style=flat-square&logo=react&logoColor=white)
![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS 3.4](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

![Java 21](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square)
![Spring Boot 3.5](https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![Python 3](https://img.shields.io/badge/Python-3-3776AB?style=flat-square&logo=python&logoColor=white)

![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis 7](https://img.shields.io/badge/Redis-7-FF4438?style=flat-square&logo=redis&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white)

[快速启动](#快速启动) · [功能范围](#已有功能与接入范围) · [文档索引](docs/README.md) · [验收记录](docs/progress.md)

</div>

---

面向算法与科研实验室的成员、工位、项目、会议、请假、计算资源、成长考核和打印机状态管理平台，同时提供经审核的公开实验室主页。

**已部署到 huawei2：[lab.icthub.top](https://lab.icthub.top)，成员入口为 [实验室平台](https://lab.icthub.top/app/dashboard)。** B00–B12 本仓实现与隔离验收完成，2026-09-30 [主分支七项 CI 全部通过](https://github.com/xju-arlab/xju-lab/actions/runs/36719040292)。生产 PostgreSQL/Redis、独立 Authentik 客户端、HTTPS 路由和 SMTP SSL 认证已验证；真实账号完整登录、实际邮件投递及设备/OJ 联调仍待完成。已实现实名/唯一学号登记、班级解析年级、多选方向和角色约束；打印功能仅保留设备状态。Lab 与 OJ 是同级应用，共用身份提供方，角色按来源隔离。逐包证据见[进度记录](docs/progress.md)与[集成状态](docs/integration-status.md)。

## 快速启动

管理员可通过 SSH config 和跳板连接添加服务器，自动安装专用公钥并识别硬件，连接成功后保存；GPU 按型号汇总数量。「实时查询」开关默认关闭，开启后按需读取 CPU/内存/磁盘/负载及 NVIDIA GPU 利用率并保存曲线，关闭后停止后续查询，后台不定时连接 SSH。支持版本化删除；[检查与发布记录](docs/progress.md)、[配置、密钥与生产边界](docs/ssh-server-onboarding.md)见接入说明。

已验证环境：Node.js 24.16.0、pnpm 10.17.1。使用仓库锁文件安装，不混用 npm/yarn。

```bash
git clone https://github.com/xju-arlab/xju-lab.git
cd xju-lab/frontend
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 明确运行演示模式，打开 <http://localhost:5173/app/dashboard>。huawei2 上的生产服务为 <http://127.0.0.1:18080>，只监听服务器回环地址，供反向代理使用；个人电脑访问 [lab.icthub.top](https://lab.icthub.top)。后端和 API 模式的本地依赖步骤见[backend/README](backend/README.md)；API 请求失败不会回退到演示数据。

```bash
# 在 frontend/ 中执行
pnpm build
pnpm test:assessment
pnpm test:seats
pnpm test:cache
```

`build` 包含 TypeScript 检查。上述检查的实际执行结果、验收范围和历史浏览器证据见[进度记录](docs/progress.md)。

## 已有功能与接入范围

| 模块 | 本地实现 | 生产或外部待验证 |
|---|---|---|
| 总览、项目、待办、会议 | API 模式、统一任务、项目成员/里程碑、会议行动项 | 真实团队资料和组织策略 |
| 工位 | 确认布局、版本冲突、服务端分配与历史；点击桌面显示带三角指向的成员信息气泡 | 真实名册导入 |
| 请假 | 服务端状态机、审批、时区/重叠校验、审计与 outbox | 正式 SMTP 投递 |
| 打印机状态 | 管理员登记设备及 Agent 凭据；只读 CUPS 状态采集；仪表盘在线/离线状态；无打印页或任务接口 | 真实设备上的状态 Agent 与 CUPS 联调 |
| 计算资源 | SSH 添加/删除、跳板与公钥免密、硬件识别、默认关闭的按需查询/历史曲线、可选 Prometheus | 实际部署证据见进度记录；设备故障告警仍需 Prometheus |
| 成长与考核 | 服务端计分/双排行/修订/CSV/发布快照；OJ 单链接任务 | OJ 目标端接口与双系统验证 |
| 成员、设置、展示 | OIDC 会话/API 模式、角色同步 outbox、显式公开快照、PWA；生产 Authentik 与域名/TLS 已配置 | 真实双账户完整登录、实名登记与权限验收 |

Lab 普通成员仅接受邮箱已验证的 `@icthub.top` 注册。用户指定现有 `winbeau` 为首位超级管理员，仅对配置中精确匹配的 issuer + subject 放行已验证外域邮箱，首次真实登录时引导角色。注册时必须登记真实姓名、唯一学号、规范班级和至少一个研究方向；班级示例为 `计算机24-3`，年级自动解析。成员可自行修改班级/方向，姓名/学号只可由超级管理员更正。

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

运行配置见 [backend/README](backend/README.md) 和 [`deploy/compose.yaml`](deploy/compose.yaml)；全栈 API 见 [`contracts/openapi.yaml`](contracts/openapi.yaml)。huawei2 的生产 `.env` 已配置且不进入 Git；后续部署使用：

```bash
cd /home/winbeau/projects/xju-lab && ./deploy.sh
```

脚本快进更新 `main`、构建启动并检查服务就绪。`lab.icthub.top` 的反向代理目标为 `http://127.0.0.1:18080`。公开资料尚未发布时页面显示空状态，不影响健康检查。备份、构建代理和回退约束见 [docs/operations.md](docs/operations.md)。

## 接续开发

先读 [AGENTS.md](AGENTS.md)、[交接入口](docs/HANDOFF.md)、[完整开发计划](docs/plan/06-backend-completion.md)和[验收标准](docs/acceptance.md)。计划覆盖全部 R01–R12，保留现有外观与工位标定，按 B00–B12 连续实施，不再受旧版“只做前端、每轮一步”限制。

新开 Luna 对话时使用[交接中的单句提示词](docs/HANDOFF.md#新对话提示词)。[文档索引](docs/README.md)列出专项规则和当前进度。

## 复用与公开内容

前端部分基础组件、样式和配置来自 `xju-feiyue`，MIT 许可副本与修改范围见[第三方说明](frontend/THIRD_PARTY_NOTICES.md)。本仓库尚未为其余代码指定独立开源许可证；公开可见不等同于为所有内容授予 MIT 许可。配置只提交示例，不提交真实凭据、成员资料、成绩导出、数据库备份或设备密钥。
