# experience-v2 / tata 核心疗愈引擎 v1 迁移说明

## 版本范围

- Experience Constitution：`experience-v1` → `experience-v2`
- GuidanceState：v1/v2/v3 → v4
- Event：`event-v2` → `event-v3`
- Character、Prompt、Policy、Response Style：`2026-08-24.1`

## 状态与数据

- v4 新增短期 `healing` 片段状态；旧会话按非活跃片段迁移，不持久化人格、创伤、病因或核心伤痛推断。
- 疗愈片段在高风险中断、用户结束、删除或 24 小时过期时清空；长期记忆只允许用户明确确认的支持方式。
- `anonymous_users` 新增一次性深入理解同意时间和可修改开关；需要部署 Prisma migration `202608240001_healing_v1_consent`。
- event-v3 只记录片段 ID、枚举反馈、来源和版本，不记录对话正文、洞察正文或核心痛点分类。

## 兼容与回滚

- GuidanceState 读取兼容 v1/v2/v3/v4，数据库 JSON 字段无需结构迁移。
- 旧行为事件继续作为 legacy 数据保留；产品指标仅使用当前事件版本。
- 若安全、依赖、隐私或现实困境误报出现严重回归，停止扩大体验；可关闭主动深入，但不能通过弱化安全规则或修改冻结金标回滚指标。

## 发布声明边界

本版本可以描述为“提供疗愈体验”，不能宣称治疗、临床疗效或保证每位用户改善。自动 Eval 通过不等于疗愈有效；盲评和至少 50 个自愿片段反馈完成前，体验有效性与扩大发布状态均为 `pending`。
