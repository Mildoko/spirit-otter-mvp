# 中文情绪评测数据

该目录保存灵体水獭情绪识别与承接能力的去标识化研究材料。

当前版本为 `emotion-dataset-cn-v0.1-candidate`：包含 240 条单轮候选和 30 组双轮候选，共 300 条用户话语。所有自动生成记录均标记为 `annotationStatus=candidate`，不得作为人工金标准或发布通过证明。

## 文件

- `schemas/emotion-annotation-v1.schema.json`：交换格式。
- `guidelines/emotion-annotation-guide-v1.md`：人工标注规则。
- `guidelines/pilot-annotation-assignment-v1.md`：20 条试标与 10 条复标人工队列。
- `samples/dev.jsonl`：180 条单轮开发候选。
- `samples/validation.jsonl`：30 条单轮验证候选。
- `samples/test.jsonl`：30 条单轮冻结候选；完成双审前不得称为冻结金标。
- `samples/multi-turn.jsonl`：30 组、60 条多轮候选，验证/测试各 15 组。
- `provenance/sources.json`：当前候选集的来源登记。
- `provenance/sources.example.json`：新增来源的登记模板。

运行 `npm run report:emotion` 校验候选数据并生成 fallback 报告；配置模型后运行 `npm run test:model:emotion`。人工完成双人标注、分歧仲裁和数据卡签字后，才能发布 `emotion-gold-cn-v1.0`。
