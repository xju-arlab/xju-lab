# XJU Lab 前端

React + TypeScript + Vite，沿用飞跃的 Tailwind/shadcn/Radix 组件与设计变量。当前为可运行的前端原型；后端尚未接入，界面数据为演示。

## 启动与检查

已验证 Node 24.16.0、pnpm 10.17.1。在本目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test:assessment
pnpm test:seats
```

预览：<http://localhost:5173/app/dashboard>。`build` 包含类型检查；上述构建、16 项考核测试与工位测试已通过，详情见[进度](../docs/progress.md)。不在 Windows 和 WSL 间混用同一 node_modules。

## 当前代码

- `src/App.tsx`：Shell、路由和多数页面/演示状态，后续按模块接入 API 时拆分。
- `src/features/seats/`：工位确认布局、标定、成员分配和 SVG/PNG 导出。
- `src/features/assessment/`：双方向考核、两种排行、录分、CSV 和 OJ 链接导入交互。
- `src/api/contracts.ts`：建议接口表，尚非可执行或冻结契约。
- `src/styles/`、`src/components/`：已存在的全局样式、品牌 token 与公共组件。

设置、个人资料、考核修改、工位布局和分配保存在当前浏览器 localStorage；其余演示业务主要保存在会话内。保存并不代表跨设备同步。打印不上传文件、不连接设备；OJ 弹窗只校验链接，不导入成绩。

后续遵循[完整计划](../docs/plan/06-backend-completion.md)：正式模式接 API，保留现有外观和确认工位布局，不在请求失败时回退假数据。复用许可见[第三方说明](THIRD_PARTY_NOTICES.md)。
