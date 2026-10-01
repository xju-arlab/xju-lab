# 本地运行、备份与恢复

## 启动

需要 Docker Compose、Java 21、Node/pnpm 和 Python 3.10+。复制 `.env.example` 到本机 `.env` 并设置随机开发凭据；`.env` 不提交。仅启动本地依赖和隔离的 Keycloak：

```bash
docker compose --env-file .env --profile local-idp --profile local-dev up -d postgres redis object-store mailpit keycloak
```

按 [backend/README.md](../backend/README.md) 的环境变量启动 API，并在 `frontend/` 运行 `pnpm install --frozen-lockfile` 与 `pnpm dev:api`。huawei2 部署需先填好 `.env` 中 OIDC、SMTP、数据库密钥和公开 origin，再从仓库根目录运行 `./deploy.sh`。后端和前端仅通过内部网络通信；宿主机网页端口绑定到 `127.0.0.1:18080`。`lab.icthub.top` 的反向代理上游为 `http://127.0.0.1:18080`，应用公开 origin 使用 `https://lab.icthub.top`。

每次运行本地或生产配置前可以执行：

```bash
docker compose --env-file .env.example -f deploy/compose.yaml config --quiet
```

它只验证 Compose 展开，不会连接生产服务。完整本地自动检查见 [scripts/verify.sh](../scripts/verify.sh)；需要已安装依赖且 Docker 可供 Testcontainers 使用。

## huawei2 部署

首次部署在 huawei2 上执行：

```bash
cd /home/winbeau/projects
gh repo clone xju-arlab/xju-lab xju-lab
cd /home/winbeau/projects/xju-lab
cp .env.example .env
chmod 600 .env
```

在 `.env` 中填写 PostgreSQL/Redis 密码、Authentik OIDC client、邮件 SMTP、首位超级管理员的确切 OIDC `sub`、审批令牌加密密钥和 `https://lab.icthub.top` origin；`PRODUCT_REGISTRATION_DOMAIN=*` 表示允许任意已验证邮箱（`icthub.top` 值仅保留为可选的严格域名模式）。Authentik 需开放自助注册、验证邮箱所有权，并在 OIDC ID/UserInfo 返回 `email` 与布尔型 `email_verified=true`。Lab 接受 163、QQ、Gmail 等任意已验证邮箱，新注册账户仅获得 Lab MEMBER。Authentik Provider 回调地址为 `https://lab.icthub.top/login/oauth2/code/lab`。Lab 与 OJ 是同级应用，共用身份提供方；角色分别归属各产品，已确认的 Lab SUPER_ADMIN→OJ Admin 授权仍作为独立来源同步。不要把 `.env` 提交到 Git。

首次登录后，新成员必须提交真实姓名、学号、班级和至少一个研究方向；班级格式为专业简称加两位年份和班号，例如 `计算机24-3`、`信安25-1`、`电信26-2`。系统从班级解析年级。成员可修改班级和方向；姓名、学号仅 SUPER_ADMIN 可更改，并会记录审计。

### 当前生产身份与邮件配置

2026-09-30 已在 huawei2 的现有 Authentik 中创建独立 `xju-lab` 应用和机密 OIDC 客户端，issuer 为 `https://auth.icthub.top/application/o/xju-lab/`。沿用现网已验证邮箱、稳定账户 ID 的映射及登录流程，不修改 OJ 客户端或全局权限组。共享注册流程已有邮箱验证。2026-10-01 用户澄清统一平台域名不应限制邮箱后缀，Lab 改为任意已验证邮箱准入；现有 OJ 统一身份直接复用，无需再次注册。

用户明确指定现有 `winbeau` 为首位超级管理员。生产配置只对该身份的确切 issuer + subject 引导超级管理员角色；不会按昵称、邮箱相似性或“第一个登录者”授权。首次成功登录才创建 Lab 成员、引导角色及审计记录；撤销角色后再次登录不会恢复引导角色。真实姓名和学号仍由本人首次登记。

生产 `.env` 位于 `/home/winbeau/projects/xju-lab/.env`，权限 `600`，已被 Git 忽略。数据库、Redis 和审批加密密钥独立随机生成；邮件使用现网 Authentik 的阿里云 SMTP 配置（465、`SMTP_SSL=true`、`SMTP_STARTTLS=false`），没有复用 OJ 的客户端密钥。更换服务器时从受控秘密备份恢复 `.env`，不要重新生成已有数据库/审批密钥。`OJ_BASE_URL`/`OJ_SERVICE_TOKEN` 和 Prometheus 配置为空，表示外部连接器尚未联调。

Compose 中 PostgreSQL、Redis、API 和 Web 设置 `restart: unless-stopped`。SSH 专用密钥保存在持久卷中；宿主机重启后 Docker 恢复这些服务，手工停止的服务不会自动启动。

huawei2 的 Docker 构建代理使用宿主机回环地址，因此其 `.env` 设置 `LAB_BUILD_NETWORK=host`，使构建阶段能访问该代理。其他环境默认 `default`。此选项仅作用于镜像构建，不改变生产容器的独立网络和回环端口；部署终端需保持现有代理可用。若日志出现构建容器连接 `127.0.0.1:10808` 被拒绝，应先检查构建网络及宿主机代理，不要改动其他项目或全局 Docker 配置。

部署与后续更新使用同一条命令：

```bash
cd /home/winbeau/projects/xju-lab && ./deploy.sh
```

脚本只允许 `main` 分支，快进拉取 `origin/main`；若脚本自身更新则重新执行新版。拒绝开发占位值，校验 Compose 后构建并启动 API/Web，最后直接探测本机 Web、health 和 ready（回环请求不经过代理）。公开资料未发布时 lab-profile 返回 404，不作为部署故障。发布路由的本地上游填 `http://127.0.0.1:18080`，外部站点是 `https://lab.icthub.top`。路由应转发原始 Host 与 `X-Forwarded-Proto: https`，并确保该域名规则优先于更宽泛的规则。

## 惠普状态接口绑定

生产 `.env` 设置 `HP_PRINTER_STATUS_ENABLED=true`，再运行 `./deploy.sh`。服务只读访问固定地址 `https://hp.icthub.top/v1/status`；默认关闭，CI/本地不会请求真实打印机。无需安装或签发这台设备的 Agent 凭据，也不接受用户输入任意 URL。

- 启用后以唯一来源 `HP_STATUS` 自动登记一个设备，重启/重复同步不会新增副本。每 15 秒读取一次，连接/请求超时为 3/6 秒，不跟随重定向。管理员在管理设置中停用设备后停止请求；重新启用恢复读取。
- 总览显示接口给出的名称、型号、纸张状态和每个墨盒的独立余量。估计值保留「约」，未知显示未知；「未报告缺纸」不推断为纸张充足。设备与队列纸张报告不一致时分别显示。
- 源接口失联为「状态暂不可用」，上游声明过期、设备观察时间缺失/超过 90 秒或明显超前为「数据已过期」；读取时间过期也不能报告在线。保留的旧信息带最后读取时间，不以同步任务活跃冒充设备在线。
- 状态存于 PostgreSQL V10 的 `printer.source_*` 列；只保存展示所需字段，不保存队列任务/用户信息。API 仍要求成员登录，浏览器不直接跨域访问源服务；现有 CUPS 状态 Agent 可继续登记其他设备。本项目不触发打印。

## 备份

### 请假附件（V11）

请假附件使用私有 `leave_attachment` 表的 `bytea` 列，与申请在同一事务提交，随 PostgreSQL dump 一起备份/恢复；首版无需配置生产 S3。每申请最多 5 个附件，单个 10 MiB、合计 25 MiB；Nginx 请求上限 26 MiB，Spring 单文件上限 10 MiB、请求上限 26 MiB。列表只取元信息。下载必须通过当前会话和申请对象权限检查，固定 `application/octet-stream`、附件下载与 `private, no-store`，不提供公开 URL 或内联预览。文件类型按扩展名白名单限制，未提供病毒扫描或内容真实性识别。生产容量与保留策略仍由实验室运维确定；备份需包含附件表，不单独清理其中行或数据库卷。

本次迁移同时增加会议地址、项目资源模式和链接；原数据默认空地址及 GitHub 模式，不改工位布局。GitHub/HuggingFace/百度网盘只保存对应平台 HTTPS 分享链接，不抓取外部内容。

### 备份脚本

设置受限文件系统上的 `BACKUP_ROOT`（必须在仓库外）、`DATABASE_URL`、`S3_BUCKET`，并通过 AWS CLI 的标准环境或凭据配置提供只读对象列表/读取及备份目录写入权限，然后运行 `scripts/backup.sh`。可设置 `AWS_ENDPOINT_URL` 用于兼容 S3 的测试端点。脚本创建权限为当前用户私有的目录，保存 PostgreSQL custom dump、指定 bucket 的对象副本和 SHA-256 清单。

为获得同一时间点的一致快照，生产演练应先进入维护窗口，暂停 API/Agent 写入并等待活动 outbox 作业收敛；确认数据库和对象存储快照均完成后再恢复服务。仓库没有声称已验证生产备份的保留周期、不可变副本或跨区域恢复。

## 恢复

先准备**隔离数据库**和专用目标 bucket。设置 `BACKUP_DIR`、`RESTORE_DATABASE_URL`、`RESTORE_CONFIRM=I_HAVE_VERIFIED_THE_TARGET_BEFORE_RESTORING`。若也要恢复对象，显式设置 `RESTORE_S3_BUCKET`；脚本会验证清单后恢复数据库，并让目标 bucket 精确匹配备份，删除目标中多余的对象。恢复前再次核对数据库和 bucket；`pg_restore --clean` 会删除目标数据库内的冲突对象，S3 `--delete` 会删除目标中备份没有的对象。

`scripts/test-backup-restore.sh` 只接受回环 PostgreSQL/S3 测试端点、不同的源/目标数据库与桶，并要求 `BACKUP_RESTORE_TEST_CONFIRM=I_UNDERSTAND_THIS_USES_DISPOSABLE_LOCAL_TARGETS`。它在专用目标中创建探针行和对象，执行备份，移除源对象，再恢复并比对对象内容与数据库引用；同时确认目标桶的陈旧对象被清除。CI [运行记录](https://github.com/xju-arlab/xju-lab/actions/runs/36665041393)已在 PostgreSQL 17.6/RustFS 1.0 上通过，演练 job 用时 43 秒。该测试验证脚本链路，不验证完整应用库、生产 RTO/RPO、应用健康或跨区域恢复。

## 回退与运维限制

- 数据迁移使用 Flyway；回退通过前一镜像与经验证的数据库备份执行，不手工删除卷。
- 不运行 `docker compose down -v`，除非已确认是可丢弃的测试环境。
- Printer Agent 仅发送设备和耗材状态心跳；此版本不提供文件提交、打印队列或执行接口。
- `.env`、OIDC/S3/SMTP token、备份、成员及成绩导出不放入 Git。
- `deploy/prometheus/prometheus.yml` 不含虚构 exporter target；生产环境应显式登记并核实目标身份和访问控制。

## SSH 采样与镜像权限

已保存 SSH 资产无需配置 Prometheus；开启「实时查询」后由鉴权请求触发采样，关闭时不自动采样；表 `server_metric_sample` 保存 25 小时历史。SSH 密钥和已确认指纹继续保存在原 `ssh-state` 卷。采样没有密码认证或自动确认新指纹，失败记录与有效读数分开；监控曲线从实际采样开始积累。

镜像显式赋予 `/app/ssh-helper` 代码读取和目录遍历权限，并以普通 `app` 账户加载 worker 验证；私钥目录权限不变。CI 会用目录 700/脚本 600 模拟受限宿主机，避免 Git 拉取时的 umask 导致上线后不可读。构建工具独立分层、Maven 依赖使用 BuildKit 缓存，SSH 代码改动不再使 Java 源码编译层失效。

### 请假邮件上线状态（2026-10-01）

`f5afb18` 已部署，生产 `mailEnabled` 已开启（版本 2）；仅向有效管理员发送待审批邮件，邮件中含原始申请附件，正文链接免登录打开详情后需明确确认。生产带显示名称的发件地址已修复，受影响通知已补发且用户确认收到；未发送队列为 0。`MAIL_FROM` 支持裸邮箱或单一带名称邮箱，发送时统一为实验室名称。真实邮件审批操作、退信/限流和大附件客户端展示仍待验证。可在实验室设置关闭邮件通知；不要手工重放历史抑制的 outbox。详见 [请假邮件审批](leave-email-approval.md)。
