# P0：能力真相源、隐私追踪与研究门槛 v1

本 P0 解决三个会直接影响可信体验的问题：界面与后端对能力说法不一致、模型问题缺少可定位证据、自动测试通过后过早把体验描述为有效。它影响 `EX-05`、`EX-09`、`EX-10`；优先级保持为安全与现实边界、核心体验、产品策略、Eval 指标。

## Capability Manifest

`GET /api/runtime` 的 `capabilityManifest` 是运行时唯一真相源，版本为 `capability-manifest-v1`。每项能力必须提供：

- `status`：`available / demo_only / unavailable`。
- `dataMode`：`persistent / ephemeral / none`。
- `requiresExplicitAuthorization`：是否需要用户单次明确授权。
- `agentIds` 与不可用原因码。

当前社区读取只代表策展演示内容；社区写入和现实外部行动始终为 `unavailable`。Demo 的记忆和反馈只在进程内保存，不能标成正式持久能力。旧布尔字段暂时保留供已有客户端兼容，新功能不得再从界面文案自行猜测能力。

## AI 元数据追踪

默认 `AI_OBSERVABILITY_ENABLED=false`。启用时需同时提供 Langfuse 公钥、密钥和 HTTPS 地址。实现使用精简的 OpenTelemetry Node tracing provider 与 Langfuse OpenTelemetry Span Processor，但没有引入或启用 HTTP/OpenAI 自动埋点，只导出名称为 `ai.model.call` 的手工白名单 Span。

允许字段只有操作名、供应商、模型、重试序号、耗时、输入/输出 token 数、结果与失败类别、运行模式和固定的 `metadata_only` 标记。不允许 Prompt、用户原文、模型回复、用户/会话/对话标识、记忆内容、Schema 错误详情或异常消息。资源自动探测和媒体上传均关闭。

配置：

```text
AI_OBSERVABILITY_ENABLED="true"
LANGFUSE_PUBLIC_KEY="pk_..."
LANGFUSE_SECRET_KEY="sk_..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

运行 `npm run report:ai-privacy` 会生成不含密钥内容的隐私预检报告。`status=passed` 表示元数据白名单和 HTTPS 边界有效；`readiness=configuration_pending` 表示尚未提供 Langfuse 凭据，不能描述为已接通。

参考实现依据：[OpenTelemetry JS Node SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/) 与 [Langfuse OpenTelemetry 集成](https://langfuse.com/docs/observability/sdk/opentelemetry)。

## 三人盲评与 50 段门槛

盲评包继续由 `npm run review:experience` 生成，答案键单独保存。发布报告只接受 `core-experience-review-result-v2`：至少三个唯一匿名评审者、至少 10 个案例、明确确认在揭盲前独立完成、无红旗，且人工结论接受候选。

运行 `npm run report:feedback-gate -- --safety-review=<人工安全复核.json>` 会从 `event-v4` 的结构化结束反馈生成 `voluntary-feedback-gate-v1`。门槛固定为：

- 完整、唯一、自愿反馈片段至少 50 个；
- `hit + partly >= 75%`；
- `more_space + clearer + more_choice >= 60%`；
- `worse <= 5%`；
- `too_analytical <= 10%`；
- 经人工复核的安全、依赖或隐私严重事件为 0。

安全复核文件格式：

```json
{
  "schemaVersion": "research-safety-review-v1",
  "status": "completed",
  "seriousIncidentCount": 0,
  "reviewedBy": ["researcher-anonymous-id"],
  "reviewedAt": "2026-08-26T00:00:00.000Z"
}
```

样本不足或安全复核未完成时为 `pending`；阈值失败或发现严重事件时为 `blocked`；数据格式损坏时为 `invalid`。只有 `passed` 才允许 `report:release` 输出 release，而且报告本身仍不执行发布。

## v1 到 v2 迁移说明

发布决策报告升级为 `core-dialogue-release-decision-v2`。旧的 `core-experience-review-result-v1` 不再足以证明盲评完整性，因为它只有人数，没有唯一评审者标识与揭盲前独立完成确认。迁移时以模板重新填写 v2，不得把自动评分或同一人的重复记录补成三名评审者。冻结体验阈值、金标、Judge 和样本没有为了当前实现而修改；本次只把已有研究约定变成不可绕过的检查。

## P0.5 证据来源完整性扩展

P0.5 影响 `EX-07`、`EX-09`、`EX-10`，并保持安全与现实边界、核心体验、产品策略、Eval 指标的优先顺序。它在不调整任何金标、冻结样本、阈值或 Judge 的前提下，为自动 Eval、事件审计、产品指标和自愿反馈报告增加 Git 来源校验。发布决策只接受与当前 `HEAD` 完全一致、且生成时工作区干净的报告；当前工作区自身也必须干净。人工盲评结果还必须填写实际受评候选的 `candidateCommit`。缺失来源信息、旧 SHA 或 dirty 报告一律保持 `hold`，不能用重新命名文件或复制旧报告绕过。

该扩展不把三人盲评、50 段真实自愿反馈或人工安全复核自动化，也不会合成待补数据。事件与产品指标报告仍必须从真实 `event-v4` 数据库生成。
