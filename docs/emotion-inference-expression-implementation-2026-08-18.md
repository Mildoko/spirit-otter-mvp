# 灵体水獭情绪承接与文字表达实现记录

日期：2026-08-18

## 已实现

- 在现有一次 DeepSeek 信号抽取中加入 VAD、控制感、15 类最多双标签、主体、证据和 `inferred/neutral/unknown/user_corrected` 状态。
- 加入确定性自报、否认、改口、引用他人和假设过滤；当前轮明确自报优先于上一轮纠正，纠正只影响下一次成功回复。
- 旧情绪状态安全归一化为 `unknown`，不把旧 `valence=0` 当作中性；`unknown` 不参与 VAD/控制感平滑。
- 新增独立 `EmotionExpressionBrief`，仅调整承接温度、句子复杂度、问题压力和措辞，不改变风险、路由或行动授权。
- 增加五项情绪回复硬校验和一次受控修复；失败后回到克制 fallback。
- demo/lab 默认开启，full 默认关闭；关闭时不向 Prompt 和回复校验器注入情绪 v2 规则，也不公开情绪标签。
- 演示页展示“水獭的猜测”、中文标签和五档强度，并提供准确、不准确、暂不明确、没有明显情绪四种反馈。
- 纠正按浏览器会话保存在内存中，同轮重复提交覆盖；刷新可恢复，退出、reset 和删除会清空；只有主动导出才产生数据文件。
- elevated/high/imminent 不展示具体标签；他人情绪不会作为用户情绪展示或用于用户表达策略。
- 建立 300 条中文候选话语、Schema、数据卡、来源登记、标注手册、20 条试标及 10 条复标队列。
- 新增情绪识别、模型/fallback 对照、困难分桶、表达自动门禁和人工盲评模板。

## 命令

- `npm run test:emotion`：情绪单元测试和 300 条候选数据完整性校验。
- `npm run report:emotion`：生成 fallback 识别报告、困难分桶和表达自动报告。
- `npm run test:model:emotion`：调用 DeepSeek，生成真实模型报告及模型/fallback 对照；存在任何 fallback 时以失败退出。

## 尚未完成的人工门禁

- 300 条记录目前全部是 `candidate`，不是金标准。
- 需要两名标注员独立完成试标、复标和冻结集标注，再由第三人仲裁。
- Kappa/Alpha、Jaccard、人工盲评和内部成员一周预试尚未执行。
- 因当前未配置 `TEST_DATABASE_URL`，Postgres 集成测试明确记为未运行，不能计入全绿。
- full 的 `EMOTION_INFERENCE_V2` 保持关闭，以上人工门禁通过前不得开启。
