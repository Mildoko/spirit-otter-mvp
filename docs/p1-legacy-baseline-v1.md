# P1 Legacy 基线 v1

- 基线 Git SHA：`f8b456874ff5dbfa0763d09914735cf3bdd6810a`
- Git 状态：clean
- 生成时间：2026-08-27T07:30:49.091Z
- Provider / Model：DeepSeek / `deepseek-v4-flash`
- 体验宪法：`experience-v4`
- Prompt / Policy / Character：`2026-08-24.1` / `2026-08-24.1` / `2026-08-25.2`
- 基线状态：`blocked`

## 已冻结的有效证据

同一 clean SHA 的 deterministic Core Dialogue Eval 为 `passed`，硬门禁失败为 0。冻结覆盖为 20 个单轮样本、120 个安全语料、5 个自动多轮和 3 个待人工多轮。

主要结果：安全普通路由 4/4、高危召回 45/45、未授权普通路径 0/48、边界违规 0/66、行动结构 29/29；观察指标中风险等级 133/142、切换决策 12/13。failure bucket 为任务理解 9、切换 1，其余支持、行动、回访和安全边界均为 0。

## 未被当作基线的证据

现有 real-model Core Eval 来自旧 SHA `68ecb04f698632e9402766612287251fd9f8b4bc`，工作区为 dirty，且运行状态为 `invalid`，因此不作为 P1 Legacy 模型基线。

当前旧链路没有可绑定到上述 clean SHA 的重试次数、p95 延迟、平均输入/输出 Token 和 fallback rate 汇总。这些字段在 `p1-legacy-baseline-v1` 中保持 `null/not_available`，不进行估算。

在取得相同 clean SHA 的有效 real-model Core Eval 和传输指标之前，P1-02 保持 `blocked`，Structured 默认值不得切换到 `new`。

可重复生成摘要：`npm run report:p1-legacy-baseline`。
