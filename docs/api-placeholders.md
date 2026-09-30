# 前端接口占位

本页保留早期演示前端的接口占位记录。当前生产模式按 [`contracts/openapi.yaml`](../contracts/openapi.yaml) 请求真实 API；打印提交及文件接口已删除，只保留打印机状态读取与管理员设备登记。

| 前端模块 | 建议接口 | 当前行为 |
|---|---|---|
| 总览 | GET /api/v1/overview | 从演示数据计算统计 |
| 项目与待办 | GET/POST /api/v1/projects；GET/POST /api/v1/projects/{projectId}/tasks；PATCH /api/v1/tasks/{taskId} | 会话内新增项目、任务和完成状态 |
| 工位 | GET /api/v1/seats；PUT /api/v1/seats/{seatId}/assignment；GET /api/v1/members；GET/PUT /api/v1/seats/layout | 确认布局固化于项目；标定和示例成员分配分别保存到当前浏览器 xju-lab.seat-layout.v1、xju-lab.seat-assignments.v1，不跨设备；见[工位设计](design/12-seat-layout.md) |
| 请假 | GET/POST /api/v1/leave-applications；审批和撤回子接口 | 会话内提交、审批、撤回 |
| 打印机状态 | GET /api/v1/printers；POST /api/v1/printer-agent/heartbeat | 仪表盘展示服务端状态和设备心跳；不接收打印任务 |
| 会议 | GET /api/v1/meetings；PUT /api/v1/meetings/{meetingId}/minutes | 纪要保留在当前页面会话 |
| 计算资源 | GET /api/v1/compute/servers；GET /api/v1/compute/metrics | GPU 节点显示演示指标；CPU 部署服务器作为待录入配置的占位节点；接口未调用 |
| 成长与考核 | GET /api/v1/assessment/acm/contests 及 /{contestId}/ranking；GET /api/v1/assessment/theory/exams 及 /{examId}/ranking；PUT /api/v1/assessment/theory/exams/{examId}/grades/{memberId}；PATCH /api/v1/assessment/member-groups/{memberId} | 前端计算 ACM/理论综合排行；成绩覆盖值和老成员标记存 localStorage 的 xju-lab.assessment.v2，不请求真实服务；详见[设计](design/09-assessment-and-showcase.md) |
| 设置与资料 | GET/PUT /api/v1/lab/settings；GET/PATCH /api/v1/members/me | 实验室设置和个人资料保存在当前浏览器 localStorage；尚未跨设备同步 |
| OJ 导入 | POST /api/v1/assessment/acm/imports；GET /api/v1/assessment/acm/imports/{importId} | 单链接弹窗校验来源和比赛 ID，显示尚未接入，不请求 OJ、不修改成绩 |
| 超级管理员联动 | PUT /api/v1/admin/members/{memberId}/roles；GET /api/v1/admin/members/{memberId}/oj-role-sync；POST /api/v1/admin/members/{memberId}/oj-role-sync/retry | 仅登记后端计划与接口占位；真实角色授权和同步尚未实现，见[11 专项](design/11-oj-import-and-admin-sync.md) |
| 实验室主页 | GET /api/v1/public/lab-profile | 展示静态内容；首版招新只展示联系方式/说明，源码旧 POST applications 占位不在本轮范围，B00 清理 |

路径、权限和字段以 OpenAPI 契约为准；前端正式模式失败不得回退演示结果。计算资源中没有受控采集源的字段明确显示未接入。
