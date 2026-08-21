# 灵体水獭 Topic Skill / Astrology Skill v1

版本：`astrology-skill-v1`

知识版本：`astrology-knowledge-v1`

Harness：`skill-harness-v1`
状态：实现完成，默认关闭；真实模型与人工体验评审完成前不得宣称可发布。

## 产品定位

星座 Skill 是澜泊的一个受约束话题能力，不是独立人格、算命 Agent 或外部专家。首版只覆盖西方十二星座的流行文化知识、太阳星座常见日期、自我观察和关系讨论。

不提供运势、吉凶、医疗、法律、投资、手术、生育、死亡或重大关系决策；不计算上升、月亮、宫位、相位或完整星盘。星座描述不得冒充科学诊断、人格定论或命运事实。

## 结构与优先级

链路为：风险识别 → Core ResponsePlan → Topic Skill Resolver → Prompt/Style → 生成 → Core + Skill Validator → 修复或受控 fallback。

优先级固定为：安全与现实边界 > EX 核心体验 > 产品策略 > Skill 指令 > Eval。Skill 不能修改风险、角色、切换、行动或回访授权，每轮最多一个白名单 Skill。

受影响不变量：EX-01、EX-04、EX-05、EX-07、EX-08、EX-09、EX-10。EX-02、EX-03、EX-06作为不得被 Skill 干扰的非回归约束。

## 激活与退出

- Feature flag：`ASTROLOGY_SKILL_V1=false`，默认关闭。
- 低风险的明确星座问题可激活；普通知识问答使用 `casual_topic`，先直接回答，不强行心理咨询化。
- 星座只是情绪或危险叙述背景时不激活；`elevated/high/imminent` 由核心支持或 `safety_plain` 接管。
- 用户退出后立即停止；只有再次明确提出星座问题才重新激活。
- 精确星盘和高风险决策请求使用本地能力边界回复，不调用模型伪造结果。

## 知识、隐私与可观测性

知识包完全本地、版本化。临界日期只能给常见范围，并说明年份、时区和出生时刻可能影响精确太阳位置。

星座轮次不抽取长期记忆；生日、星座、出生时间和地点也被 Memory Guard 拦截。原始消息仍遵循现有对话保存、过期和删除规则，不新增用户画像或数据库字段。

匿名事件为 `topic_skill_evaluated`、`topic_skill_activated`、`topic_skill_blocked`、`topic_skill_validation_failed`。事件只记录 ID、版本、能力、来源、原因码、违规码、响应源和耗时，不记录生日、对话原文或 Prompt 内容。

## 第三方调研决策

- [iztro](https://github.com/SylarLong/iztro)：MIT、活跃，但属于紫微斗数，不进入首版。
- [Kerykeion](https://github.com/g-battaglia/kerykeion) 与 [horosa-skill](https://github.com/Horace-Maxwell/horosa-skill)：AGPL，且能力范围超出产品边界，不集成。
- [AstroChart](https://github.com/AstroDraw/AstroChart)：仅作为未来星盘可视化候选。
- [astrologyjs](https://github.com/morphatic/astrologyjs)：未来精确西方星盘候选；启用前需另做外部 API、隐私、同意和 Chart Eval 评审。

首版没有复制第三方 Skill 文本、没有新增第三方运行依赖，也不会运行时加载网络 `SKILL.md`。

## Eval 与发布

- `npm run test:eval:skill:astrology`：48 条单轮、8 条多轮、复用 120 条安全语料，进入 CI。
- `npm run test:eval:skill:astrology:model`：真实模型通道；普通激活样本若 fallback，整次运行无效。
- `npm run review:skill:astrology`：生成 24 组基线/候选盲评包和分离的 answer key。

硬门禁包括安全中断、非星座误激活、行动泄漏、高风险/宿命化/伪科学表达、虚构精确星盘、退出失效、生日长期记忆泄漏和模型通道伪基线。自然度、趣味性、文化熟悉度、角色连续性、直接回答和免责声明负担必须人工评审。
