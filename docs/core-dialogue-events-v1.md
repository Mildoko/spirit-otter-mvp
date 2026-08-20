# Core Dialogue Event v1 / v2：第二、三阶段实施说明

第二阶段只建设可观测性，不改变 Router、Prompt、角色回复、行动授权或安全策略，也不直接计算线上北极星和发布门禁。

## 已实现范围

首批最小事件集：

1. `session_started`
2. `user_turn_submitted`
3. `support_turn_completed`
4. `transition_eligibility_evaluated`
5. `transition_invited`
6. `transition_accepted`
7. `transition_rejected`
8. `action_generated`
9. `action_confirmed`
10. `followup_created`
11. `followup_reentered`
12. `safety_plain_triggered`

同时记录 `risk_assessed`、拒绝后回到陪伴、动作与回访生命周期、求助入口以及失败轮次等诊断事件。

事件契约位于 `server/src/events/core-dialogue-events.ts`。所有事件统一使用 `event-v1`，写入前执行严格 schema 校验。BehaviorEvent 增加：

- `eventKey`：唯一幂等键。
- `eventVersion`：事件契约版本。
- `occurredAt`：实际发生时间。
- `isReplay`：是否来自补写或回放。

历史 BehaviorEvent 在迁移时标为 `legacy-v0`，不会被冒充为新的结构化事件。

## 数据来源

- SupportEvent 继续保存服务端内部的每轮决策 trace。
- SafetyEvent 继续保存高风险处置事实。
- BehaviorEvent 保存可用于产品分析的版本化逻辑事件。
- 所有 Core Dialogue Event 都由服务端权威产生，前端不能直接上报风险、切换或行动成功事件。

## 隐私边界

事件允许记录：

- 匿名内部 ID
- 风险、场景、灵格、支持模式等固定枚举
- 是否发生切换、行动、回访和安全中断
- 规则代码
- 长度、延迟和时间分桶

事件禁止记录：

- 用户完整输入
- 助手完整回复
- Prompt、证据片段或对话 transcript
- 联系人姓名、电话和地址
- 动作完整文本

动作文本和回复只允许在请求内存中用于计算“是否单一行动”“邀请次数”等结构事实，不能进入事件 metadata。

## 幂等规则

- turn：`turn:{turnId}:{eventName}`
- action：`action:{actionId}:{eventName}`
- followup：`followup:{followupId}:{eventName}`
- session：`session:{sessionId}:{eventName}`

数据库对 `eventKey` 建立唯一索引，写入使用 upsert。API 重试不会重复计算同一个事实。

## 审计

配置并迁移测试数据库后运行：

```text
npm run report:events
```

报告输出到：

- `test-results/core-dialogue-event-audit.json`
- `test-results/core-dialogue-event-audit.md`

审计检查事件版本、未知事件、非法字段、缺失或重复幂等键、未来时间以及最小事件覆盖。某事件在审计窗口内没有出现只表示没有走到对应路径，不自动判定为实现失败。

## 当前仍不可测

- 生产链路没有显式 `task_type`，因此 `tta_v1` 及任务类型线上切片仍不可测。
- 第三阶段已新增用户主动选择的五级回访状态和 `followup_state_labeled`。结构写入有效性可测，但自由文本回访语义准确率仍不可测。
- `Meaningful Progress`、`Support Acceptance` 等需要真实受控使用和人工反馈，不在第二阶段计算。
- 第二阶段事件不能单独证明用户被理解、获得真实推进或核心体验改善。

## 第三阶段 Event v2

`event-v2` 新增 `followup_state_labeled`，记录五级状态、前一状态、revision 和用户界面选择来源。`event-v1` 保留为历史版本；审计与产品指标不会把历史事件冒充为 v2。

## 数据库变更

迁移：`server/prisma/migrations/202608200001_core_dialogue_events/migration.sql`。

本阶段没有新增公共 API，也没有改变现有 API 响应。部署前仍需在独立测试数据库执行 `npm run db:deploy -w @otter/server` 和集成测试。
