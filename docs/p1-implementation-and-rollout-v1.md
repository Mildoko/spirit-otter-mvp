# P1 智能内核升级实施与回退手册 v1

## 范围与体验约束

本次实现影响 `EX-01`～`EX-04`、`EX-06`～`EX-12`。优先级固定为：安全与现实边界、核心体验、产品策略、Eval 指标。现有风险 Guard、Reply Validator、记忆 Guard、金标、冻结样本、阈值和 Judge 均保留。

默认配置仍为：

```text
LLM_STRUCTURED_OUTPUT_MODE=legacy
GUIDANCE_ENGINE_MODE=legacy
ACTION_ENGINE_MODE=legacy
FOLLOWUP_ENGINE_MODE=legacy
```

四个开关只接受 `legacy/shadow/new`，非法值会拒绝启动。Shadow 只用于冻结数据或受控环境；Structured Shadow 不对真实用户请求发起双倍模型调用。

## 已实现能力

- Node 基线固定为 `22.22.0`；全部 CI 使用相同版本。
- Structured Registry 为 analyze、generate、repair、critique_healing、extract_memories 提供版本化 Zod / JSON Schema，并继续以 Zod 为最终校验。
- 传输层统一 Legacy Chat JSON、Responses `json_schema` 与 Chat Completions `json_schema` 的数据、指标和失败分类；能力探针只发送合成文本，并按官方能力依次验证 Structured transport。
- Guidance、Action、Follow-up 使用 XState v5，公共 DTO 和数据库枚举保持不变，不持久化 XState Snapshot，不执行双写。
- `xstate/graph` 生成关键状态的最短路径；影子报告覆盖 200 个 Guidance 轮次及 Action、Follow-up 路径。
- Promptfoo `0.122.0` 锁定，Provider Adapter 走现有 Orchestrator；PR 只跑无密钥契约与 128 条冻结/红队样本。
- 发布门禁只在对应模式为 `new` 时要求 Structured、State Parity、Promptfoo 的当前 clean SHA 证据；证据缺失时保持 `hold`。

E2E 迁移说明（2026-08-27）：既有 Demo 浏览器用例仍把 tata 当作默认角色，但产品当前默认角色及 Guidance/Memory Authority 已经是鹿禅。测试现由鹿禅覆盖深汐、带聊、行动和记忆，由公开 Agent 选择器显式进入 tata 的陪伴与音色场景；移动横屏断言同时遵循现有紧凑披露样式。此迁移不改产品行为、金标、阈值或 Judge，只消除旧默认角色和旧可访问名称的隐含依赖。

DeepSeek 当前官方 Responses 文档说明 `json_schema` 只适用于 `deepseek-v4-flash`。能力探针必须以实际响应为准：优先验证与模型匹配的 Structured transport，再验证另一路径；Responses 不支持但官方 Chat Completions `json_schema` 可用时采用 Chat transport，两者均不支持时保持 Legacy 并标记 `blocked_unsupported`，不得用 Prompt 模拟 Structured Output。参考：[Responses API](https://api-docs.deepseek.com/api/create-response/) 与 [Responses 指南](https://api-docs.deepseek.com/guides/responses_api/)。

## 放量顺序

1. 在 clean SHA 上生成 Legacy、Structured A/B、State Parity、Promptfoo real-model 报告。
2. 完成 24 组独立盲评和体验评审；主观维度只能由人工填写。
3. Lab 单独把目标开关设为 `new`，完成全回归后进入 Demo。
4. Demo 完成浏览器 E2E 和 PostgreSQL 集成测试后，才允许 Full 受控候选。
5. 任一安全、诊断、依赖、授权或隐私失败立即回退；非安全差异进入人工复核。

不得跨层放量，也不得因为 P1 自动分数直接发布。

## 回退

将四个模式全部恢复为 `legacy` 并重启对应环境。回退只改变 Authority 选择，不删除数据、不迁移数据库、不修改公共 API。Legacy 至少保留一个完整发布周期。

若候选已部署且出现安全或授权差异，发布决策应为 `rollback`；若证据缺失、SHA 不一致、工作区 dirty、真实模型未运行或人工评审未完成，决策应为 `hold`。

## 当前未完成的外部证据

- P1-02：缺少同一 clean SHA 的有效真实模型 Legacy 基线及重试/延迟/Token/fallback 指标。
- P1-S02/S09/S10：本地探针未取得可用 DeepSeek Responses 结果；A/B 阈值与 24 组盲评未完成。
- P1-X10/X12：本机没有 PostgreSQL，数据库路径必须由 CI 的非 skipped 集成任务确认。
- P1-E07/E08/E09：真实模型 Promptfoo 需受保护的 `LLM_API_KEY` 工作流生成当前 SHA 证据。
- P1-R02/R03/R04：人工体验对照、Lab → Demo → Full 放量和最终版本标签尚未执行。

这些项目完成前，所有环境继续使用 Legacy 默认值。
