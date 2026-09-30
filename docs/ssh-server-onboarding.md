# SSH 服务器接入

正式 API 模式「计算资源」向 LAB_ADMIN / SUPER_ADMIN 提供添加、停用和删除。填写中文名、选择别名或粘贴 SSH config，点击连接，按需要确认每台主机的 SHA256 指纹、输入跳板/目标账户密码。连接采用细进度条，成功后显示飞跃风格的小尺寸青绿勾选、轻量淡入和硬件快照，点击保存才创建资产。普通成员只读。

## 配置和部署

下拉框读取 **Lab 服务端** 挂载配置，不读取浏览器所在电脑文件。`LAB_SSH_CONFIG_DIR` 指定含 `config` 的专用目录，默认 `deploy/ssh-config`，只读挂载。生产可设置 `/home/winbeau/lab-ssh-config` 等绝对路径；容器用户必须可读。该目录仅放连接配置，不放个人私钥。

```sshconfig
Host training
  HostName 192.0.2.10
  User lab
  ProxyJump gateway
Host gateway
  HostName 192.0.2.20
  User lab
```

支持 Host / HostName / User / Port / ProxyJump、Host * 默认项和最多三层跳板。跳板使用独立 Host 段声明，参数遵循首个匹配值。IdentityFile 等客户端偏好会明确提示已忽略，统一使用 Lab 专用密钥。拒绝 Include / Match / ProxyCommand / LocalCommand，不执行配置中的命令或展开环境变量。目前支持 Linux 普通密码或公钥认证；不支持交互式多因素认证和 Windows SSH 目标。

backend 镜像包含 Python + Paramiko 5.0.0 worker，通过标准输入输出传递有限 JSON。密码不进入进程参数、数据库、审计和临时文件。参考 [Paramiko Transport](https://docs.paramiko.org/en/stable/api/transport.html) 与 [认证和主机校验](https://docs.paramiko.org/en/stable/api/client.html)。

## 密钥和访问

- Compose `ssh-state` 卷持久保存自动生成的 3072 位 RSA 专用私钥、已确认主机指纹和锁文件；目录 0700、密钥/指纹文件 0600。正常重新部署保留卷。须纳入受控加密备份，不能提交 Git；现有业务数据库备份脚本不包含该卷。
- 首次密码认证后幂等追加 `xju-lab-managed` 公钥到当前账户 `~/.ssh/authorized_keys`，保留原内容，设置目录 0700 / 文件 0600，随后重新连接验证免密。需要密码的跳板也执行此步骤。无需 sudo，账户须可写 SSH 目录并允许公钥登录；跳板须允许 TCP 转发。
- 已知指纹变化会阻止连接。先线下核验，再在受控维护窗口修改卷中 `hosts.json` 对应记录；没有绕过校验按钮。
- 取消或删除资产不会删除远端公钥，不改变远端文件。若要撤销远端访问，应由服务器管理员移除对应公钥。密钥遗失或轮换后需要重新认证。

## 状态和检测范围

PostgreSQL 草稿绑定创建人，15 分钟有效，每人最多 8 个。全部配置/连接接口仅管理员可用。单次连接最多 110 秒，最多 4 个并发 worker，网络操作不持有业务事务。重启遗留 RUNNING 可在两分钟后重试，密码不恢复。取消时进行中的固定探测可能在超时内结束，但不能保存已取消草稿。

保存使用行锁，同一草稿重复保存返回同一资产，目标账户/主机/端口去重。删除检查版本，保留脱离资产的告警历史与审计。

检测操作系统、CPU 型号/逻辑核心数、总内存、系统盘容量，以及 NVIDIA 工具或 PCI GPU 信息。缺证据时显示 UNKNOWN；缺驱动工具时只显示 PCI 标识，不编造型号/显存。硬件信息为带时间的快照。保存后默认通过已有 SSH 密钥和已确认指纹执行固定只读采样，无需安装 exporter：CPU 使用两次 /proc/stat 差值，内存读取 /proc/meminfo，系统盘读取 df，负载读取 /proc/loadavg，NVIDIA GPU 利用率读取 nvidia-smi（多卡均值）。缺工具/驱动显示暂无采样，无 GPU 的服务器不展示该指标。已有 Prometheus job/instance 的资产继续使用 Prometheus。

采集后台每 30 秒调度、最多 2 台并行，不占用业务数据库事务；慢目标可能延后一个周期。首次显示采集中，SSH 失败显示连接中断，90 秒未更新标为过期。样本存入 PostgreSQL V9 表，保留 25 小时，支持 1/6/24 小时曲线；停用停止采样，删除级联清理样本。采集不会接受新指纹、密码或追加公钥，也不会执行用户输入的命令。SSH 采集暂不产生 Prometheus 告警。

## 验证与生产边界

CI 新增真实隔离 OpenSSH 测试：错误密码、ProxyJump、追加公钥、独立 worker 重启、免密和幂等；单测覆盖配置注入拒绝、循环跳板、非法端口/用户、未知硬件、指纹变更。PostgreSQL 集成覆盖权限/归属、连接前禁止保存、重复/并发保存、取消、过期、删除版本。浏览器执行真实连接/保存/刷新/删除/免密再添加，并生成 375 / 768 / 1440 px 成功弹窗截图。实际执行结果见 progress.md，尚未执行的检查不能视为通过。

生产现场采集结果见 progress.md；隔离验收与生产采样分别记录。Prometheus exporter/告警仍需单独配置。
