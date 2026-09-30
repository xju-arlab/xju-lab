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

在 `.env` 中填写 PostgreSQL/Redis 密码、Authentik OIDC client、邮件 SMTP、首位超级管理员的确切 OIDC `sub`、审批令牌加密密钥和 `https://lab.icthub.top` origin；`PRODUCT_REGISTRATION_DOMAIN` 固定为 `icthub.top`。Authentik 需开放自助注册、验证邮箱所有权，并在 OIDC ID/UserInfo 返回 `email` 与布尔型 `email_verified=true`。Lab 只接受该域名的已验证邮箱，新注册账户仅获得 Lab MEMBER。Authentik Provider 回调地址为 `https://lab.icthub.top/login/oauth2/code/lab`。Lab 与 OJ 是同级应用，共用身份提供方；角色分别归属各产品，已确认的 Lab SUPER_ADMIN→OJ Admin 授权仍作为独立来源同步。不要把 `.env` 提交到 Git。

首次登录后，新成员必须提交真实姓名、学号、班级和至少一个研究方向；班级格式为专业简称加两位年份和班号，例如 `计算机24-3`、`信安25-1`、`电信26-2`。系统从班级解析年级。成员可修改班级和方向；姓名、学号仅 SUPER_ADMIN 可更改，并会记录审计。

部署与后续更新使用同一条命令：

```bash
cd /home/winbeau/projects/xju-lab && ./deploy.sh
```

脚本只允许 `main` 分支，快进拉取 `origin/main`，拒绝开发占位值，校验 Compose 后构建并启动 API/Web，最后探测本机 Web 和公开 API。发布路由的本地上游填 `http://127.0.0.1:18080`，外部站点是 `https://lab.icthub.top`。路由应转发原始 Host 与 `X-Forwarded-Proto: https`，并确保该域名规则优先于更宽泛的规则。

## 备份

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
