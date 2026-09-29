# XJU Lab · 实验室协作平台

面向算法与科研实验室的成员、工位、项目、会议、请假、打印、计算资源和成长考核管理平台，同时提供经审核的公开实验室主页。

**当前状态（2026-09-29）：前端原型已基本成型，后端尚未实现。** 页面使用演示数据；部分修改保存在当前浏览器，尚不具备真实认证、跨设备持久化、邮件、OJ 同步、打印和监控能力。下一阶段按[完整开发计划](docs/plan/06-backend-completion.md)完成正式系统。

## 快速启动

已验证环境：Node.js 24.16.0、pnpm 10.17.1。使用仓库锁文件安装，不混用 npm/yarn。

```bash
git clone https://github.com/xju-arlab/xju-lab.git
cd xju-lab/frontend
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://localhost:5173/app/dashboard>。开发服务默认监听 `0.0.0.0:5173`，用于本地原型预览；部署方案将在后端阶段交付。

```bash
# 在 frontend/ 中执行
pnpm build
pnpm test:assessment
pnpm test:seats
```

`build` 包含 TypeScript 检查。以上三项已在 2026-09-29 通过；验收范围和历史浏览器证据见[进度记录](docs/progress.md)。

## 已有功能与接入范围

| 模块 | 前端已有 | 正式系统待完成 |
|---|---|---|
| 总览、项目、待办、会议 | 页面、搜索、详情及演示交互 | 数据库、资源权限、统一任务、纪要版本 |
| 工位 | 31 个可坐人工位、确认布局、标定、分配、SVG/PNG 导出 | 真实成员、并发约束、分配历史、跨设备保存 |
| 请假 | 申请、模拟审批、撤回及时间校验 | 服务端状态机、指定审批人、邮件与审计 |
| 打印 | PDF 选择、选项和模拟队列 | 私有文件、持久队列、树莓派 Agent、CUPS |
| 计算资源 | GPU 演示卡片、CPU 服务器待录入占位 | Prometheus 指标、过期状态、告警 |
| 成长与考核 | ACM / 深度学习双 Tab、两种排行、录分、成员过滤、CSV | OJ 单链接导入、服务端计分、修订和发布 |
| 设置、资料、展示 | 本地保存的设置/资料及主页原型 | OIDC、角色、公开快照、发布/下架、PWA |

默认实验室名称为“算法与科研实验室”，位置为“信息楼A411”。演示个人资料中的姓名不是管理员身份；后端不得据此授权。

## 目录与技术方向

```text
frontend/   React + TypeScript + Vite；Tailwind + shadcn/Radix
backend/    Spring Boot 后端预留目录，目前仅 README
docs/       需求、设计、执行计划、验收和交接记录
AGENTS.md   开发代理的入口、约束与验证要求
```

目标架构为 Spring Boot 模块化单体、PostgreSQL、Redis、私有 S3 兼容存储、Authentik OIDC、Prometheus，以及同仓独立 Python Printer Agent。具体版本及可运行配置在后端 B00 冻结；尚不存在的启动命令不作为当前可用能力。详见[架构](docs/plan/02-architecture.md)。

## 接续开发

先读 [AGENTS.md](AGENTS.md)、[交接入口](docs/HANDOFF.md)、[完整开发计划](docs/plan/06-backend-completion.md)和[验收标准](docs/acceptance.md)。计划覆盖全部 R01–R12，保留现有外观与工位标定，按 B00–B12 连续实施，不再受旧版“只做前端、每轮一步”限制。

新开 Luna 对话时使用[交接中的单句提示词](docs/HANDOFF.md#新对话提示词)。[文档索引](docs/README.md)列出专项规则和当前进度。

## 复用与公开内容

前端部分基础组件、样式和配置来自 `xju-feiyue`，MIT 许可副本与修改范围见[第三方说明](frontend/THIRD_PARTY_NOTICES.md)。本仓库尚未为其余代码指定独立开源许可证；公开可见不等同于为所有内容授予 MIT 许可。配置只提交示例，不提交真实凭据、成员资料、成绩导出、数据库备份或设备密钥。
