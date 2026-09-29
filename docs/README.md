# XJU Lab 文档索引

[项目 README](../README.md) · [AGENTS.md](../AGENTS.md)

> 当前方向：前端原型已基本成型，进入后端与全栈开发准备；后端仍未实现。新对话按 B00–B12 连续完成项目，旧 F01–F10 作为前端历史和回归清单。

## 开发入口

| 文档 | 用途 |
|---|---|
| [新对话交接](HANDOFF.md) | 单句提示词、真实起点、环境、首个动作 |
| [完整开发计划](plan/06-backend-completion.md) | 当前执行依据：默认值、权限/数据契约、B00–B12、外部缺项与完成标准 |
| [进度记录](progress.md) | 实际实现、命令结果、证据和下一项 |
| [验收与需求追踪](acceptance.md) | R01–R12 与前端/后端/外部验收 |
| [决策与外部配置](plan/04-decisions-and-questions.md) | 已确认需求、工程默认值、上线前待补信息 |

## 需求与架构

| 文档 | 用途 |
|---|---|
| [概要计划](plan/README.md) | 产品范围与交付目标 |
| [需求与业务口径](plan/01-requirements.md) | R01–R12、非目标、统计与时间口径 |
| [总体架构](plan/02-architecture.md) | 前后端、身份、数据库、Agent、监控边界 |
| [路线图](plan/03-roadmap.md) | 新执行包与原 A0–E 的对应关系 |
| [前端步骤](plan/05-frontend-steps.md) | F01–F10 历史清单；剩余项随 API 接入完成 |
| [API 占位清单](api-placeholders.md) | 当前页面建议路径，尚未冻结的接口 |
| [依据与复用来源](references/README.md) | 原始需求、参考仓库、许可与资料 |

## 专项规则

| 文档 | 用途 |
|---|---|
| [前端风格](design/01-frontend.md) | 保留已有外观、控件和响应式 |
| [成长与考核](design/09-assessment-and-showcase.md) | 两种排行、过滤、25%/75%、理论形式、缺失值与修订 |
| [OJ 导入与管理员同步](design/11-oj-import-and-admin-sync.md) | 单链接全量导入、稳定身份、来源权限、outbox 和撤销 |
| [工位布局](design/12-seat-layout.md) | 已确认标定、分配、配色、导出 |
| [设计索引](design/README.md) | 已有专项和随各工作包补齐的设计任务 |

新增后端设计先落实当前包需要的状态、数据约束、权限和可执行契约，再实现与验证，不为补齐整套空文档阻塞开发。`contracts/`、迁移、部署与 Agent 等路径在对应工作包创建，目前不能当作已存在产物。旧进度中的“本轮不提交/不开发后端”只描述当时任务，不覆盖当前用户授权。
