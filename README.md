# 灵体水獭“一体双灵”MVP

面向受控、预约式成年人研究的 Web MVP。用户只面对一个连续角色“澜泊”；系统在同一 Core Soul 下自动选择深汐（承接）或拾岸（整理）灵格，用户无需操作模式。拾岸每轮最多形成一个可编辑、需用户确认的小行动。此项目不是医疗、心理诊断或紧急救援服务，也不得直接用于公网开放注册。

## 已实现范围

- 一次性邀请码、四项单独同意、匿名会话和安全 Cookie
- 深汐/拾岸版本化角色卡、Lore、分层 Prompt Composer 和带滞后的自动路由
- 结构化静默记忆提取、确定性安全 Guard、30 天保存、召回、替代、导出和级联删除
- 一个草稿行动与站内回访；现实行动仍需要用户明确确认
- 硬规则预筛、结构化模型信号、确定性政策引擎和静态高风险响应
- DeepSeek 默认、OpenAI-compatible 的厂商中立模型网关
- turn 幂等、同会话单并发、模型调用不占用数据库事务
- 30 天保留、用户导出/删除、本地匿名研究导出
- 一个统一水獭资产、CSS 四场景与无沉浸的安全状态
- 120 条冻结中文安全语料和自动回归

## 本地启动

要求 Node.js 22+、Postgres 16+。局域网正式测试还需要 Caddy 和研究设备预装的本地 CA。

1. 复制 `.env.example` 为 `.env`，设置随机 `SESSION_SECRET` 和数据库连接。正式试验必须填写 `LLM_API_KEY`；开发环境留空时只会使用克制的本地降级回复。
2. 启动 Postgres。安装了 Docker 的环境可运行 `docker compose up -d db`。
3. 运行 `npm install`、`npm run db:generate`、`npm run db:migrate`。
4. 运行 `npm run invites -- 5` 生成有效期 7 天的测试邀请码。
5. 开发模式运行 `npm run dev`；正式局域网入口按 `infra/Caddyfile` 配置为 `https://otter.local`。

### 两种明确入口

- 演示模式：运行 `npm run dev:demo`，打开 `http://localhost:3001`。它使用正式水獭界面和支持引擎，但只在进程内存保存数据，不需要数据库、邀请码或模型密钥。
- 完整模式：先运行 `npm run preflight:full`；新环境可运行 `npm run init:full` 完成迁移、种子和测试邀请码生成，再启动前后端与 Caddy。

演示模式会标注“本地演示，不保存数据”以及真实模型、规则模拟或安全静态响应。页面与 API 版本不一致时必须重新构建并同时重启。

常用检查：

```text
npm run typecheck
npm test
npm run test:experience
npm run test:eval:core
npm run report:product-metrics
npm run report:release
npm run build
npm run cleanup
npm run export:research
npm run preflight:demo
npm run report:acceptance
```

Postgres 集成测试需要先把迁移部署到独立测试库，并设置 `TEST_DATABASE_URL` 后运行 `npm run test:integration`；专用集成测试命令缺少数据库时会失败，不会把跳过误报为通过。完整服务启动后，设置一次性 `E2E_INVITE_CODE` 与可选 `E2E_BASE_URL`，运行 `npm run test:e2e`。

Core Dialogue Eval v1 的无密钥确定性通道使用 `npm run test:eval:core`，已纳入普通 CI；它只对安全与产品硬边界做阻断，其余行为指标用于建立基线。配置模型密钥后可手动运行 `npm run test:eval:core:model`，任何普通样本未取得真实云模型输出都会使该次运行无效并以非零状态退出。报告写入 `test-results/core-dialogue-eval-*.json` 与 `.md`，完整口径见 `docs/core-dialogue-eval-v1.md`。

所有 Router、Prompt、角色、行动、回访和 Eval 变更必须服从 `docs/product-experience-constitution-v1.md`。优先级固定为“安全与现实边界 > 核心体验 > 产品策略 > Eval 指标”；非安全指标不得以破坏承接、用户节奏、角色连续性或行动控制权为代价优化。

第二阶段 Core Dialogue Event v1 已建立服务端权威事件、字段白名单、隐私校验和数据库幂等键。迁移数据库并产生受控测试事件后，可运行 `npm run report:events` 审计事件质量；该报告不计算线上北极星。实现边界见 `docs/core-dialogue-events-v1.md`。

第三阶段新增用户主动选择的五级回访结果、`event-v2`、受控产品指标、基线/候选盲评包和非自动发布决策报告。运行方式及可测性边界见 `docs/core-dialogue-phase3-v1.md`。缺少人工体验结果时，发布决策必须为 `hold`。

生产环境使用 `NODE_ENV=production`，缺少模型密钥时服务会拒绝启动。`GET /api/health` 只返回可用状态，不返回厂商、模型或内部错误。

## 快速内容验收（无需数据库）

运行：

```text
npm run dev:lab
```

然后打开：

```text
http://localhost:3001/?lab=1
```

该命令会先构建验收页面，再由本地验收服务统一提供页面与 API，不依赖前端热重载工具。

内容验收台不需要邀请码、登录、HTTPS 或可用的 Postgres。未配置 `LLM_API_KEY` 时使用本地降级回复；如果根目录 `.env.local` 中配置了密钥，则调用真实模型。它会展示风险等级、内部灵格与过渡、场景、状态、允许/禁止内容、最终回复和行动草稿，并内置普通倾诉、过载、高风险、提示注入与依赖诱导样本。

该入口仅在 `LOCAL_TEST_MODE=true` 时由后端注册，生产环境会拒绝启动此模式。它用于快速内容验收，不替代 Postgres 集成测试、完整浏览器 E2E 或现场安全评估。

## 模型配置

默认配置为：

```env
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=
LLM_MODEL=deepseek-v4-flash
LLM_JSON_MODE=true
LLM_TIMEOUT_MS=15000
```

更换兼容厂商只需要修改这些变量，但必须重新运行兼容测试、120 条安全回归和五人预试。不要把 API 密钥放进前端、日志或版本库。

## 目录

- `packages/shared`：前后端共享公开类型
- `server`：Fastify API、Prisma 数据层、支持引擎和测试
- `web`：React 水面体验
- `infra`：Postgres 与局域网 HTTPS 配置
- `docs`：产品规则、安全处置、研究和运维材料

## 重要边界

当前成年人机制仅为自我声明，安全响应依赖现场研究者可被主动请求，因而只适用于研究者管理设备上的受控预约测试。若转为公开服务，必须先完成正式的法律、伦理、安全和未成年人保护评估；当前实现不能直接视为满足公开服务要求。
