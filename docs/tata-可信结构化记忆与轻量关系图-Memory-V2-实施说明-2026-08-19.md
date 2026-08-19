# tata 可信结构化记忆与轻量关系图（Memory V2）实施说明

日期：2026-08-19

当前分支：`agent/full-experience-foundation`

发布状态：Demo/Lab 可体验，Full 默认关闭

## 1. 本次升级解决的问题

Memory V2 将原有的简单长期记忆升级为“可信声明、时间状态、轻量关系和用户控制”四部分组成的记忆系统。

主要目标是：

- 区分用户明确说过的内容、模型推测和用户已经确认的内容。
- 避免过期、被纠正、被否定或已删除的信息继续影响对话。
- 在不引入向量数据库和图数据库的前提下，让相关人物、事件、偏好和触发因素形成一跳关系。
- 让用户能够完整查看、确认、纠正、停用、恢复、否定和删除 tata 的记忆。
- 保持高风险对话、敏感信息和跨用户数据严格隔离。

首期继续使用 PostgreSQL、Prisma 和现有 `MemoryItem`，没有引入 Embedding、pgvector、Neo4j 或完整 GraphRAG。

## 2. 已完成的功能

### 2.1 可信声明状态

每条记忆和关系都可以标记为：

- `asserted`：来自用户明确陈述。
- `hypothesis`：模型推测，不能当作确定事实使用。
- `confirmed`：经过用户确认或纠正后形成的稳定记忆。

模型推测关系仅允许使用 `may_trigger` 和 `related_to`，置信度必须不低于 0.9，并在 7 天后进入过期状态。

### 2.2 时间与有效性

系统分别记录：

- `observedAt`：系统获知信息的时间。
- `eventAt`：用户所说事件发生或预计发生的时间。
- `validFrom` / `validTo`：事实的有效时间范围。
- `reviewExpiresAt`：推测内容需要复核或自动过期的时间。
- `expiresAt`：原有数据保留期限。

时间解析支持明确日期以及“今天、昨天、明天”等可靠相对时间。对于“上个月某天”“过阵子”等模糊表达，系统保留原始证据，但不会伪造精确日期。

### 2.3 轻量关系图

新增 `MemoryRelation`，形成如下结构：

```text
MemoryItem → MemoryRelation → MemoryItem
```

首期支持：

- `involves`
- `may_trigger`
- `supports`
- `contradicts`
- `updates`
- `related_to`
- `part_of`

关系两端必须属于同一用户。数据库迁移中包含约束和触发器，防止跨用户关系写入。

召回时先选择最多 4 条直接相关记忆，再进行最多 2 条一跳关系扩展，总数不超过 6 条、文本预算不超过 1200 字。

未确认推测关系最多进入对话一次，之后只保留在管理页面等待用户处理。关系只有在一次回复成功完成后才会被标记为“已经呈现”，失败请求不会消耗这次机会。

### 2.4 记忆生命周期

记忆状态支持：

- `active`
- `disabled`
- `rejected`
- `superseded`
- `expired`
- `deleted`（公共契约状态；用户删除执行物理删除）

已经停用、否定、过期、失效或被替代的内容不会参与召回。

用户纠正一条记忆时不会覆盖原记录。系统会创建一条用户确认的新记忆，并将旧记录标记为 `superseded`，从而保留清晰的修订链。

用户否定后，系统保存拒绝指纹，阻止相同错误内容再次被模型自动写入。用户选择删除时，会物理删除记忆、证据及关联关系，不保留隐藏副本。

### 2.5 提取与安全保护

单轮模型输出最多包含：

- 2 条记忆候选。
- 2 条关系候选。

写入前执行确定性 Guard：

- 证据必须能在用户原文中找到。
- 禁止敏感和高度敏感内容自动保存。
- 禁止跨用户关系。
- 模型推测不得冒充用户明确陈述。
- `high` 和 `imminent` 风险对话不提取、不保存、不更新任何记忆或关系。

记忆、证据、替代链和关系使用同一数据库事务写入，任一步失败都会整体回滚。

### 2.6 召回与 Prompt 注入

直接记忆按照以下维度综合排序：

- 文本相关性：30%。
- 重要度：20%。
- 时间新近度：15%。
- 记忆类型：15%。
- 声明可信度：10%。
- 当前有效性：10%。

未确认推测额外降权 25%。注入 Prompt 时会明确标注“用户明确说过”“用户已确认”或“未确认推测”，防止 tata 将推测内容说成确定事实。

### 2.7 用户管理接口

已经实现：

- `GET /api/me/memories`
- `PATCH /api/me/memories/:id`
- `DELETE /api/me/memories/:id`
- `PATCH /api/me/memory-relations/:id`
- `DELETE /api/me/memory-relations/:id`
- `/api/me/export` 的 Memory V2 扩展
- `/api/runtime` 的 `memoryV2Enabled` 字段

Demo 与 Full 使用相同公共字段和管理操作。

### 2.8 “tata 记得的我”页面

设置面板中增加“tata 记得的我”入口。管理页面支持：

- 按全部、正在使用、已停用、不准确和已更新筛选。
- 按偏好、人物、事件、边界、目标等记忆类型分组。
- 展示证据、获知时间、事件时间、有效时间和关系说明。
- 清楚区分“你说过”“tata 的推测”“你已确认”。
- 确认、纠正、停用、恢复、否定和物理删除。
- 关系的确认、停用、恢复、否定和删除。
- 键盘、读屏、长文本和手机窄屏适配。

浏览器视觉验收过程中发现手机端筛选栏会出现横向滚动条，已经改为自动换行；关闭按钮尺寸也已在窄屏固定。

## 3. 特性开关

新增环境变量：

```env
MEMORY_V2=false
```

默认策略：

- Demo：开启。
- Lab：开启。
- Full：关闭。

在 Full 达到数据库集成、模型质量和人工灰度门禁前，不应将该开关改为 `true`。

关闭 `MEMORY_V2` 时，现有 V1 聊天、记忆、导出和删除行为保持兼容。

## 4. 数据库变更

Prisma Schema 增加：

- 记忆声明状态和时间字段。
- 扩展后的记忆状态。
- `MemoryRelation` 模型及枚举。
- 用户、来源记忆和目标记忆索引。
- 活跃关系去重约束。
- 关系端点同用户约束。

迁移文件：

```text
server/prisma/migrations/202608190001_trusted_memory_graph/migration.sql
```

迁移会将现有明确来源记忆回填为 `asserted`，将已有模型推测回填为 `hypothesis`。

部署 Full 前必须先备份数据库，并在目标环境执行 Prisma 迁移。

## 5. 评测与测试

### 5.1 已执行结果

- TypeScript 类型检查：通过。
- Prisma Schema 校验：通过。
- 服务端自动化测试：320 项通过。
- 前端单元测试：17 项通过。
- Demo 桌面与手机端 E2E：12 项通过，4 项按运行模式预期跳过。
- 500 次相同记忆和关系重复提取压力测试：通过，最终保持 2 条记忆和 1 条关系。
- 100 例中文记忆评测集结构校验：通过。
- 桌面和手机端实际浏览器体验检查：通过。

100 例评测集覆盖：

- 明确事实：35 例。
- 时间表达：15 例。
- 关系：20 例。
- 更新和否定：10 例。
- 隐私：15 例。
- 应当放弃提取：5 例。

### 5.2 已实现但尚未执行的发布门禁

以下测试代码和执行入口已经完成，但本次没有实际运行：

1. Full PostgreSQL 集成测试
   - 当前环境没有提供独立的 `TEST_DATABASE_URL`。
   - 9 项数据库集成测试被安全跳过，没有使用开发数据库执行清空型测试。

2. 100 次真实模型质量评测
   - 执行命令：`npm run test:model:memory`。
   - 会产生 100 次真实模型调用，因此没有在未确认成本的情况下自动执行。
   - 门禁为明确事实召回不低于 95%、关系召回不低于 85%、错误提取率不高于 10%。

3. 30 分钟人工稳定性观察
   - 自动压力测试已覆盖重复写入和关系增长。
   - 正式 Demo 灰度前仍需完成一次连续 30 分钟人工体验，观察重复记忆、关系增长、页面操作和跨会话恢复。

## 6. 发布前操作建议

建议按照以下顺序发布：

1. 在隔离测试数据库运行全部集成测试。
2. 执行 100 例真实模型评测并保存质量报告。
3. 在 Demo/Lab 完成 30 分钟稳定性体验。
4. 检查删除、拒绝、纠正和重新登录后的状态保持。
5. 保持 Full 的 `MEMORY_V2=false` 完成数据库迁移。
6. 先向少量测试用户开启 Full 灰度。
7. 指标达到门禁后再扩大范围。

## 7. 主要工程文件

- `packages/shared/src/index.ts`：Memory V2 公共契约。
- `server/prisma/schema.prisma`：数据库模型。
- `server/prisma/migrations/202608190001_trusted_memory_graph/migration.sql`：数据库迁移。
- `server/src/modules/memory/guard.ts`：候选记忆和关系安全过滤。
- `server/src/modules/memory/temporal.ts`：时间表达解析。
- `server/src/modules/memory/repository.ts`：Full 持久化与召回。
- `server/src/modules/memory/management.ts`：用户管理操作。
- `server/src/demo/store.ts`：Demo 同契约内存实现。
- `server/src/routes/me.ts`：记忆和关系管理 API。
- `server/src/modules/memory/evaluation-cases.ts`：100 例评测集。
- `server/src/scripts/memory-evaluation.ts`：模型评测和发布门禁。
- `web/src/components/MemoryCenter.tsx`：记忆管理页面。
- `web/e2e/demo-flow.e2e.ts`：用户管理端到端测试。

## 8. 后续版本方向

Memory V2 稳定后，可以根据真实召回数据评估 Memory V3：

- PostgreSQL `pgvector`。
- Embedding。
- 关键词、结构化字段和语义向量混合召回。
- 更强的时间衰减与冲突消解。
- 关系图可视化。

这些能力应建立在本次可信声明、生命周期、用户控制和安全隔离之上，而不是替换这些基础规则。
