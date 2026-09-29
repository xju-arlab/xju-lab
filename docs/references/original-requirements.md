# 用户原始需求归档

[返回依据索引](README.md)

> 原文保留，后续用户确认以 docs/HANDOFF.md 和决策表为准。

---

完全可以，而且这套需求已经足够做成一个比较完整的 **LabOS / 实验室管理平台**。你选的 `React + TypeScript + Spring Boot` 很合适。我建议核心架构不要做得太花，重点把 **打印机 Agent、邮件审批、服务器监控** 这几个有意思的模块设计好。

## 1. 我建议的整体架构

```text
                    ┌─────────────────────────┐
                    │      React + TS         │
                    │ Web / PWA / Mobile App  │
                    └────────────┬────────────┘
                                 │ HTTPS
                                 ▼
                    ┌─────────────────────────┐
                    │      Spring Boot        │
                    │       LabOS API         │
                    ├─────────────────────────┤
                    │ Auth / Leave / Project  │
                    │ Print / Meeting / Seat  │
                    │ Assessment / Server     │
                    └───┬────┬────┬──────┬───┘
                        │    │    │      │
             PostgreSQL ┘ Redis  MinIO   SMTP

                              ↓
                    ┌────────────────────┐
                    │ Prometheus         │
                    │ Server Monitoring  │
                    └─────────┬──────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
         node_exporter   dcgm-exporter   Docker等
         CPU/RAM/磁盘      GPU状态

打印链路：

 SpringBoot
      │
 WebSocket / MQTT
      ▼
┌─────────────────┐
│ Raspberry Pi 4B │
│ Printer Agent   │
│ CUPS            │
└────────┬────────┘
         │ USB / Ethernet
         ▼
      打印机
```

最大的原则是：

> **网页服务器不要直接控制打印机。树莓派作为实验室内部的 Printer Agent。**

这样打印机即使没有公网 IP，也可以工作。

---

# 2. 前端怎么做

我推荐：

```text
React
TypeScript
Vite
React Router
Ant Design
TanStack Query
Zustand
Axios
ECharts
```

页面结构直接这么设计：

```text
/dashboard
/seats
/leave
/print
/projects
/meetings
/assessment
/showcase
/servers
/profile

/admin/users
/admin/printers
/admin/servers
/admin/settings
```

### App 不建议重新写 React Native

你的场景没有特别强的 native 需求。

第一版直接：

> **React Web + PWA**

手机浏览器访问后可以“添加到主屏幕”，体验已经很像 App。

以后真想打 APK / iOS：

```text
React
  ↓
Capacitor
  ↓
Android / iOS
```

这样一套 React 代码就行。

---

# 3. 工位一览

这个模块我觉得可以做得很漂亮。

不要简单搞一个表格，建议做：

```text
实验室平面图
┌────────────────────────────────────┐
│                                    │
│  A01       A02        A03          │
│  张三      李四       [空闲]        │
│  项目A     项目B                    │
│                                    │
│  B01       B02        B03          │
│  王五      [请假]      赵六         │
│                                    │
└────────────────────────────────────┘
```

用 **SVG + React** 实现。

每个工位：

```ts
Seat {
    id
    code
    x
    y
    userId
    status
}
```

颜色表示：

```text
绿色：有人
灰色：空闲
黄色：请假
蓝色：临时工位
红色：维护
```

点击工位弹：

```text
成员
年级
方向
当前项目
负责事项
最近状态
联系方式
```

这个会比传统 OA 的工位表高级很多。

---

# 4. 请假系统

这个很好实现，而且**可以邮件审批**。

流程：

```text
学生提交请假
     ↓
Spring Boot
     ↓
生成 Approval Request
     ↓
SMTP 发给老师
     ↓
老师收到：

张三申请请假
2026/10/1 - 2026/10/3

[同意]
[拒绝]
[查看详情]

     ↓
点击按钮
     ↓
Spring Boot 完成审批
```

但是注意：

### 不建议

```text
GET /leave/approve?id=123
```

因为有些邮件安全扫描器会自动访问链接。

一不小心：

> 老师甚至没打开邮件，请假就批准了。

正确设计：

```text
邮件链接
↓
进入审批页面
↓
显示请假详情
↓
老师点击“确认同意”
↓
POST /api/leave/{id}/approve
```

链接里带：

```text
随机一次性 token
过期时间
审批人
```

例如：

```text
/approval/leave?token=xxxxxxxx
```

数据库：

```text
leave_request

id
applicant_id
start_time
end_time
reason
status

PENDING
APPROVED
REJECTED

approver_id
created_at
approved_at
```

再单独建立：

```text
approval_action
```

保存所有审批操作。

以后查：

> 谁、什么时候、通过了谁的申请

全部可审计。

---

# 5. 打印机系统

这个模块是整套系统里面我觉得最值得认真做的。

## 树莓派直接做 Print Gateway

树莓派：

```text
Raspberry Pi OS
+
CUPS
+
Printer Agent
```

打印机如果支持 USB：

```text
Pi USB → Printer
```

最简单。

如果打印机自己带网口，也可以：

```text
Pi wlan0
   ↓
实验室 WiFi

Pi eth0
   ↓
Printer Ethernet
```

Pi 给打印机固定 IP。

---

## 打印流程

用户：

```text
上传 PDF
↓
选择：

打印机
页码
份数
单双面
长边/短边翻转
黑白/彩色

↓
提交
```

Spring Boot：

```text
保存文件 MinIO
创建 print_job
通知 Raspberry Pi
```

Pi：

```text
收到 print job
↓
下载 PDF
↓
调用 CUPS
↓
打印
↓
更新状态
```

比如双面：

```bash
lp \
  -d LabPrinter \
  -o sides=two-sided-long-edge \
  file.pdf
```

短边翻：

```bash
-o sides=two-sided-short-edge
```

当然有一个前提：

> **打印机硬件本身必须支持自动双面。**

如果打印机没有 Duplex Unit，软件没法凭空实现自动双面，只能做“先打印奇数页→翻纸→打印偶数页”的人工流程。

---

# 6. 为什么打印 Agent 最好主动连接服务器

千万别：

```text
公网服务器
    ↓
直接访问实验室树莓派
```

这样你还得 NAT / 公网 IP / 端口映射。

建议：

```text
Raspberry Pi
     │
     │ WebSocket 长连接
     ▼
公网 Spring Boot
```

例如：

```text
wss://lab.xxx.com/ws/printer
```

Pi 主动连接。

于是：

```text
Server → WebSocket → Pi
```

不用暴露树莓派公网端口。

---

# 7. 打印任务表

推荐：

```text
print_job
```

字段：

```text
id

user_id
printer_id
file_id

copies
page_range

duplex
duplex_mode

color_mode

status

QUEUED
DOWNLOADING
PRINTING
SUCCESS
FAILED
CANCELED

created_at
started_at
finished_at

error_message
```

后台就可以做：

```text
今日打印：
张三 22 页
李四 13 页

本月：
黑白 1321 页
彩色 117 页
```

甚至以后：

```text
每人免费 500 页/月
```

都很好做。

---

# 8. 油墨 / 硒鼓告急邮件

这个也完全可以。

但打印机品牌不同，获取方式不完全一样。

优先顺序：

```text
SNMP
↓
IPP
↓
CUPS
↓
厂商 API
```

很多网络打印机通过 SNMP 可以读取：

```text
Black Toner  : 17%
Cyan         : 61%
Magenta      : 43%
Yellow       : 58%
Drum         : 81%
```

Pi 定时获取：

```text
printer_supply
```

Spring Boot 设置：

```text
toner < 15%
```

发送：

```text
【实验室打印机告警】

HP M479fdw 黑色硒鼓剩余约 12%。

当前状态：
Black: 12%
Cyan: 67%
Magenta: 55%
Yellow: 72%

请及时准备更换。
```

这里建议做**告警抑制**。

不要：

```text
14.9% 发一次
14.8% 发一次
14.7% 发一次
```

而是：

```text
第一次低于15%
→ 发邮件

直到恢复/更换之前
→ 不重复发

或者 24h 最多提醒一次
```

---

# 9. 项目管理

我不建议做成 Jira 那么复杂。

实验室真正需要的就几个东西：

```text
项目
负责人
参与人
当前阶段
Milestone
Todo
风险
论文/代码链接
最近更新
```

例如：

```text
Real-time Deepfake Anticipation

负责人：XXX

成员：
A
B
C

状态：
████████░░ 80%

阶段：
[✓] Idea
[✓] Baseline
[✓] Main Experiment
[ ] Ablation
[ ] Writing
[ ] Submission

Deadline:
2026-11-10
```

这样老师扫一眼就知道进展。

---

# 10. 项目数据库

```text
project
project_member
project_milestone
project_update
project_task
```

比如：

```text
project

id
name
description
owner_id

status

IDEA
RUNNING
WRITING
SUBMITTED
ACCEPTED
PAUSED

start_date
deadline
repository_url
paper_url
```

---

# 11. “在跟的”考核进度

这个模块可以和项目管理分开。

例如：

```text
成员：张三

本学期：
────────────────────
论文阅读       ████████ 8/10
组会汇报       ████     2/4
项目           ███████  Running
比赛           ✓
科研记录       9次
考勤           96%
```

你可以自定义不同年级模板：

```text
大一
大二
大三
保研
研究生
```

数据库：

```text
assessment_cycle
assessment_item
assessment_progress
assessment_record
```

不要一开始做自动打分。

先做：

> **进度可视化 + 老师备注**

实用性反而更高。

---

# 12. 会议记录

页面：

```text
9月29日实验室周会

参与：
张三
李四
王五

Agenda
1. Deepfake
2. World Model
3. 新生赛

会议结论

...

Action Items

张三：
[ ] 跑完 AV1M

李四：
[ ] 完成 baseline

Deadline:
10/3
```

会议 Action Item 可以直接关联：

```text
项目
成员
截止日期
```

于是 Dashboard 可以显示：

```text
我的待办
```

---

# 13. 展示页

这一块和内部后台分开。

例如：

```text
/
├── 实验室介绍
├── 成员
├── 研究方向
├── 论文
├── 比赛
├── 项目
├── 新闻
└── 招新
```

内部：

```text
/app/*
```

外部：

```text
/*
```

甚至可以：

```text
lab.xxx.edu.cn
```

展示站。

```text
lab.xxx.edu.cn/app
```

内部管理系统。

---

# 14. 服务器状态不要自己造轮子

这个非常重要。

不要 Spring Boot 每隔 5 秒：

```text
ssh server
nvidia-smi
```

然后自己存数据库。

直接上：

```text
Prometheus
```

每台普通服务器：

```text
node_exporter
```

GPU 服务器：

```text
NVIDIA DCGM Exporter
```

你就能拿到：

```text
CPU
RAM
磁盘
Load

GPU utilization
GPU memory
GPU temperature
GPU power
GPU utilization
```

比如：

```text
dash-h200x8

CPU    31%
RAM    426 / 1024 GB

GPU0   98%   71GB / 80GB
GPU1   96%   73GB / 80GB
GPU2   0%    2GB / 80GB
...
```

Spring Boot 调 Prometheus API。

React 画图。

### 原始时间序列不要进 PostgreSQL。

Prometheus 管它就行。

---

# 15. 服务器页面我建议直接做到这个程度

```text
┌────────────────────────────────────┐
│ H200 Server                        │
│ ONLINE ●                           │
│                                    │
│ CPU  ██████░░      61%             │
│ RAM  ███████░      78%             │
│ Disk ████░░░░      42%             │
│                                    │
│ GPU 0  █████████  99%  73GB        │
│ GPU 1  █████████  96%  74GB        │
│ GPU 2  ░░░░░░░░░   0%   2GB        │
│ GPU 3  ████████░  91%  68GB        │
└────────────────────────────────────┘
```

后面还可以再加：

```text
当前用户
当前训练任务
进程 PID
Docker Container
```

但第一版不必上。

---

# 16. 后端技术栈我会这样定

```text
Spring Boot
Spring Security
PostgreSQL
MyBatis-Plus / JPA
Redis
MinIO
Spring Mail
WebSocket
Prometheus
```

我个人更倾向：

```text
Spring Boot
+
MyBatis-Plus
+
PostgreSQL
```

这种管理系统大量都是 CRUD，MyBatis-Plus 很舒服。

认证：

```text
JWT Access Token
+
Refresh Token
```

或者更简单：

```text
HttpOnly Session Cookie
```

实际上如果只有你们实验室自己用：

> **Cookie Session 比 JWT 更省心。**

---

# 17. 权限一定一开始就设计

最少：

```text
SUPER_ADMIN
LAB_ADMIN
TEACHER
MEMBER
GUEST
```

例如：

| 操作 | Member | Teacher | Admin |
|---|---:|---:|---:|
| 查看工位 | ✓ | ✓ | ✓ |
| 提交请假 | ✓ | ✓ | ✓ |
| 审批请假 | | ✓ | ✓ |
| 打印 | ✓ | ✓ | ✓ |
| 创建项目 | ✓ | ✓ | ✓ |
| 修改他人考核 | | ✓ | ✓ |
| 查看服务器 | ✓ | ✓ | ✓ |
| 管理打印机 | | | ✓ |

后台用：

```java
@PreAuthorize(...)
```

做权限检查。

---

# 18. 数据库大致就是这批表

核心：

```text
user
role
user_role

seat
seat_assignment

leave_request
approval_action

project
project_member
project_task
project_milestone
project_update

meeting
meeting_attendee
meeting_action_item

assessment_cycle
assessment_item
assessment_progress

printer
print_job
printer_supply

server

file_object
notification
audit_log
```

`audit_log` 很值得做：

```text
谁
什么时候
对什么对象
执行了什么操作
```

例如：

```text
2026-09-29 09:32
Teacher Wang
APPROVE
LeaveRequest #173
```

---

# 19. 首页 Dashboard 我建议这样

```text
LabOS
──────────────────────────────────

今日实验室
在岗 22 / 31
请假 4
空闲工位 5

我的项目
Real-time Deepfake     78%
VisualTraceGuard       92%

我的 TODO
□ AV1M 实验
□ 周会汇报
□ Ablation

服务器
H200 × 8      ● Busy
L40 × 4       ● Idle
4090 × 8      ● Busy

打印机
HP-01         ● Online
Toner         ⚠ 13%

最近会议
9/29 周会
9/27 招新会议
```

这个就已经非常像一个成熟内部系统了。

---

# 20. 我建议你的开发顺序

不要第一天就上打印、服务器、邮件、项目、考核全部一起干。

先把骨架做出来：

**Phase A**

```text
登录 / RBAC
成员
工位
项目
会议
请假
Dashboard
```

**Phase B**

```text
SMTP
邮件审批
通知中心
文件 MinIO
```

**Phase C**

```text
Raspberry Pi Printer Agent
CUPS
打印队列
双面打印
硒鼓监测
```

**Phase D**

```text
Prometheus
node_exporter
DCGM exporter
服务器 Dashboard
告警
```

**Phase E**

```text
考核
公开展示站
数据统计
```

这样不会一上来把系统写成一坨。

---

## 我最推荐的一版最终技术结构

```text
Frontend
├── React
├── TypeScript
├── Vite
├── Ant Design
├── TanStack Query
├── Zustand
├── ECharts
└── PWA / Capacitor

Backend
├── Spring Boot
├── Spring Security
├── MyBatis-Plus
├── PostgreSQL
├── Redis
├── MinIO
├── WebSocket
└── Spring Mail

Printer
├── Raspberry Pi 4B
├── CUPS
├── Printer Agent
├── IPP
└── SNMP

Monitoring
├── Prometheus
├── node_exporter
├── DCGM Exporter
└── Grafana（可选）

Deploy
├── Docker Compose
└── Nginx
```

这里面我尤其建议你把 **Printer Agent 独立成一个小项目**。它以后甚至可以作为一个挺有意思的独立开源组件：

> `LabPrint Agent：把任意 USB/局域网打印机变成实验室云打印机，支持 Web 打印、双面、队列、配额、耗材监测和 SMTP 告警。`

这个项目本身就挺有可玩性的。

如果是我来落这个系统，我会把第一版产品名字直接定成 **LabOS**，核心导航就是：

> **总览 / 工位 / 项目 / 请假 / 打印 / 会议 / 考核 / 服务器 / 实验室主页**

已经非常清晰了。
