# Core Dialogue Phase 3 v1：受控体验验证与决策闭环

第三阶段在 `experience-v1` 约束下建设回访结果状态、受控产品指标、人工盲评和发布决策报告。它不开放公网注册，不使用真实用户对话正文计算指标，也不允许自动分数单独决定发布。

## 五级回访结果

回访生命周期 `pending / deferred / completed / closed / deleted` 继续负责展示和关闭；新增用户主动选择的结果状态：

- `not_started`：还没开始。
- `partial_progress`：已经有部分推进。
- `completed`：已经完成。
- `blocked`：遇到阻塞。
- `redefined`：原行动需要重新定义得更轻。

结果状态不能由模型从自由文本猜测，只能由用户在回访卡片中选择。任何已报告的非完成状态都会关闭本次回访，避免重复催促；`completed` 为终态。状态更新使用乐观并发版本 `outcomeRevision`，每次写入 `followup_state_labeled` 事件。

数据库迁移：`server/prisma/migrations/202608200002_followup_outcome_v1/migration.sql`。

## Event v2

第三阶段事件版本为 `event-v2`。第二阶段 `event-v1` 作为历史版本保留，不补写成 v2。

`followup_state_labeled` 只记录匿名 ID、前后状态、revision、标签来源和结构合法性，不记录行动文本、用户输入或助手回复。

## 产品指标

运行：

```text
npm run report:product-metrics
```

输出 `test-results/core-dialogue-product-metrics.json` 和 `.md`。指标分为：

- `measurable`：事件事实可直接计算。
- `proxy_observational`：只能作为趋势代理，必须结合人工研究。
- `not_measurable`：缺少合法数据源，保持 N/A。

当前可报告行动接受、到期回访结果覆盖、回访重返和结构化状态写入；Meaningful Progress、低负担与对话延续只报告代理值。Support Acceptance 和 Task Type Accuracy 仍不可测。不计算综合北极星分数。

`fsa_v1` 在产品指标报告中仅表示“用户选择是否被合法写入”的结构有效性，不代表系统能从自由文本准确识别回访语义。

## 人工盲评

使用两个同版本 Core Eval JSON 生成盲评包：

```text
npm run review:experience -- --baseline=<基线.json> --candidate=<候选.json> --seed=<随机种子>
```

盲评包和答案键分开输出。至少三名评审者在查看 Eval 分数和答案键前独立判断具体承接、用户节奏、角色连续性、低压力和总体偏好。结果按 `research/core-experience/review-result.template.json` 形成机器可读记录；v2 结果必须包含三个唯一的匿名评审者标识和独立盲评确认。

受控研究完成后运行 `npm run report:feedback-gate`。只有至少 50 个同时填写理解与变化项的唯一片段、冻结的四项体验阈值全部满足，且安全/依赖/隐私严重事件人工复核为零，门槛才会通过。赞踩但未填写两项详情的提交不会被冒充为完整研究片段。

## 发布决策

在 Eval、事件审计、产品指标、人工评审文件和自愿反馈门槛报告齐全后运行：

```text
npm run report:release
```

输出 `release / hold / rollback / continue_observation`，但不执行部署或回滚。缺少人工评审、自动证据无效、体验退化或存在红旗时不得输出 release。发布仍需明确的人类授权。

## 当前边界

- 只适用于受控、预约式成年人研究。
- 产品指标使用合成或受控研究事件，不读取对话正文。
- 生产链路仍无显式 `task_type`。
- 用户可见回访界面变更在真实模型受控发布前仍需完成人工体验评审。
