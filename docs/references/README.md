# 需求与源码依据

[返回总索引](../README.md)

## 1. 用户输入

[原始需求全文](original-requirements.md)归档自用户粘贴附件。它包含架构建议，后续明确答复优先：前端复用飞跃并采用 Tailwind + shadcn/Radix；账号来自 `Projects/auth-login/`；文档在 `docs/`，代码分 `frontend/`、`backend/`；先看前端原型。早期曾仅整理交接给 Luna，用户后续已继续要求实现并修正前端。

## 2. 飞跃参考仓库

路径：`/home/winbeau/xju-arlab/xju-feiyue`。检查时 HEAD：`fd4d4ac61fa70901a4c34e5601aec5f9a4c66a27`，读取时工作区无改动输出。依据实际源码，不把旧 README 的 mock/测试数量描述当实现事实。

| 文件（仓库内路径） | 用途 |
|---|---|
| `frontend/package.json` | 原有 React/Router/Tailwind 兼容基线 |
| `frontend/src/styles/tokens.css`、`globals.css` | 实际配色、排版、圆角、阴影、shadcn HSL 桥 |
| `frontend/tailwind.config.ts` | token 语义类映射 |
| `frontend/src/components/ui/button.tsx`、`dialog.tsx` | 已复用基础组件 |
| `frontend/src/components/layout/{AppShell,Header,RequireAccess}.tsx` | 布局与守卫参考，权限不能照搬 |
| `frontend/src/stores/authStore.ts`、`api/client.ts` | token 持久化和 FastAPI 适配需重写 |
| `frontend/src/features/admin/components/StatCard.tsx` | 摘要卡参考 |
| `frontend/src/features/class/components/gantt/*`、`lib/gantt.ts` | 甘特图候选，日期和类型需适配 |
| `frontend/src/components/common/FilePreviewDialog.tsx`、`preview/PdfViewer.tsx` | PDF 预览候选 |
| `frontend/src/components/common/Markdown.tsx` | 正文候选，原始 HTML 需审查 |
| `frontend/src/pages/_dev/DesignSystemPage.tsx` | 设计系统页候选 |
| `LICENSE` | MIT 许可，副本已保留 |

已复制文件见[复用记录](../../frontend/THIRD_PARTY_NOTICES.md)，其余仍为参考。

## 3. 统一身份参考仓库

路径：`/home/winbeau/Projects/auth-login`。检查时 HEAD：`bf6c23af1d03859477e91dccbdecdf15870f1a3d`，**工作区存在未提交改动**，尤其 Authentik 资产和身份文档；观察包含工作区内容，不能全部归属于该 SHA，也不意味着已部署。未修改该仓库。

已读：`AGENTS.md`、`README.md`、`route-contract.json`、`src/auth/return-to.ts`、`docs/refactor/auth-unification/README.md`、`04-product-auth-migration.md`、`docs/plans/account-registration-and-oj-unification/03-account-identity-contract.md` 与相关状态/执行记录；检索了 blueprint 的 Provider 和 claim 配置。

采用的边界：

- 契约规范身份域为 `auth.icthub.top`，OIDC/Flow 归 Authentik；静态门户不是认证后端。
- 产品主身份使用经验证的 `iss + sub`，统一 8 位 ID 推荐 claim 为 `icthub_account_id`；email/username 不作归属主键。
- 未见 LabOS 专属 Provider。新回调、准入组和角色策略需另行设计与验证。
- 老文档与后续执行记录存在阶段差异；本轮未探测生产身份服务，不用旧故障记录断言当前不可用。
- 参考文档里的部署/commit/push 授权属于原任务，不自动授权本次修改身份服务。

## 4. 查询过的官方资料

以下辅助后续设计，实施时按冻结版本确认 API，不表示已集成：

- [Spring Security OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/core.html)：后端登录。
- [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)：会话写请求保护。
- [Authentik OAuth2 Provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)：独立产品 Provider。
- [MyBatis-Plus 入门](https://baomidou.com/en/getting-started/)：starter 版本匹配。
- [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)：指标查询。
- [CUPS IPP 实现](https://openprinting.github.io/cups/doc/spec-ipp.html)：作业创建、查询和取消。

## 5. 原型依赖实测基线

锁文件解析：React 18.3.1、Router 6.30.6、Tailwind 3.4.19、TypeScript 5.6.3、Vite 8.3.1、React 插件 6.1.1、pnpm 10.17.1；WSL Node 24.16.0。早期缺 CSS 导致的构建失败已在 F01 修复；最新构建和计分测试通过，见[进度](../progress.md)。不因该历史问题整体升级/降级依赖。

## 6. 成长与考核补充依据

- 用户本轮要求及答复：ACM / 深度学习理论基础两个 Tab；老成员按标记剔除后重算各场；理论笔试/机试在同一培养期合并历史，历史占 25%、当次占 75%。用户答复优先于附带计划中的其他综合评价比例。
- [OJ 参考排行](https://oj.icthub.top/contest/13/rank)：同时阅读 `../xju-oj/frontend/src/pages/oj/views/contest/children/ACMContestRank.vue` 及 `contestRankMixin.js`、`rankPreferences.js`，参考 AC、罚时、题目结果与首解展示，未复制 Vue 页面或修改参考仓库。
- [机试作品与评分页](https://dl.icthub.top/) 与 [2026Sep19CodingTest](https://gitcode.com/xju-arlab/2026Sep19CodingTest)：参考分项成绩、总分、排行榜及作品记录结构；未导入真实学生成绩，未实现其评分服务。
- 用户 PDF `科研实践招新与培养计划(5).pdf`：共 5 页，阅读培养主题与考核背景，部分字体文本提取失真，已渲染核对关键页。文件来自用户所指 WeChat 临时目录；未将其中的操作性文字视为新指令。
- ACM 百分位排名分与缺失值回退是本项目提出的计算方案，详见[专项设计](../design/09-assessment-and-showcase.md)，不声称是 OJ 的官方历史排行算法。
- 新增只读 OJ 集成盘点：`backend/account/models.py`、`oidc.py::_apply_admin_claims`、`tests_oidc_contract.py`、`views/admin.py`、`backend/contest/urls/oj.py`、`views/oj.py`。已确认现有 OIDC 登录会覆盖角色、普通 Admin 不等同于所有比赛管理员；因此新增[后端专项](../design/11-oj-import-and-admin-sync.md)，不是直接调用广泛账户修改接口或修改统一身份全局组。盘点的是工作区源码，未验证生产部署版本。
