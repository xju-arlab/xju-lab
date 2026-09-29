# XJU Lab 后端

当前目录仅有此说明，尚无 Spring Boot 工程、数据库迁移或真实 API。

下一步从[完整开发计划 B00](../docs/plan/06-backend-completion.md)开始，连续完成 B00–B12。目标为 Java 21 + Spring Boot 模块化单体、PostgreSQL + MyBatis-Plus + Flyway、Redis 会话、Authentik OIDC、私有 S3 存储与事务 outbox。版本在 B00 依据兼容性验证冻结。

## 实施入口

1. [AGENTS.md](../AGENTS.md)：执行、验证、公开仓库与授权边界。
2. [交接](../docs/HANDOFF.md)：真实起点、环境、单句提示词。
3. [完整计划](../docs/plan/06-backend-completion.md)：默认值、权限、数据约束和每包退出条件。
4. [总体架构](../docs/plan/02-architecture.md)、[验收](../docs/acceptance.md)：模块与交付要求。
5. [考核规则](../docs/design/09-assessment-and-showcase.md)、[OJ 导入/角色同步](../docs/design/11-oj-import-and-admin-sync.md)、[工位](../docs/design/12-seat-layout.md)：必须继承的业务细节。

先建立可运行工程、契约与一条持久化业务闭环，再逐包扩展。前端已存在，不需要先重做样式。各模块同时完成 API、权限、迁移、前端接入和测试；连接器缺凭据时保留明确状态并继续其他模块。

Maven Wrapper、启动命令、配置变量、数据库初始化和测试命令在工程实际创建并验证后补入本文件，当前不提供不存在的运行命令。
