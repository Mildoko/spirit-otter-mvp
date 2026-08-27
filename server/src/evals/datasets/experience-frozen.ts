import type { ResponsePlan } from "@otter/shared";

export const experienceFrozenDatasetVersions = {
  lowSignal: "low-signal-v1",
  expression: "expression-v2",
  character: "character-router-v1",
} as const;

export const lowSignalFrozenSamples = [
  "不知道说什么", "脑子空了", "说不上来", "不知道怎么说", "像没接上电", "卡住了", "就是很乱",
  "嗯……脑子空", "我也讲不明白", "不知道从哪里说", "就，那种，唉", "感觉堵住了", "没词了", "组织不出来",
  "不是不想说，是说不上来", "我改口，还是不知道怎么讲", "可能就是乱", "这会儿没接上电", "脑子一片空白",
  "不知道说啥", "很难形容", "话到嘴边又没了", "我接不上自己的话", "什么都说不完整",
  "不知道说什么，但也许可以理小一点", "脑子空，直接给我一个动作", "先别问，我说不上来", "算了，不想整理了",
] as const;

export const expressionDeepPlan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["TEST"], lockTurnsRemaining: 0,
  allowedContent: ["承接"], forbiddenContent: ["建议", "行动"],
};
export const expressionShorePlan: ResponsePlan = {
  ...expressionDeepPlan, activeSpirit: "shore_pick", supportMode: "mobilize", sceneState: "surface_organize",
  primaryStrategy: "one_small_action", allowActionDraft: true, forbiddenContent: [],
};

export const expressionV2FrozenCases = [
  ...["今天被否定了", "我只是有点失望", "还不想解决", "让我先说完", "这事有点复杂", "我需要缓一下", "刚才那句话让我难受", "我怕让他失望", "我还在消化", "先听着就好", "这两天睡不好", "心情不太好", "我没想清楚", "先别分析", "这件事很突然", "我有点委屈", "我不确定", "今天只想慢一点"].map((text) => ({ text, plan: expressionDeepPlan, expected: "none" as const })),
  ...["脑子里很乱", "事情全堵住了", "肩上像压着东西", "电量快见底", "所有念头挤在一起", "我卡在这里", "整个人很沉"].map((text) => ({ text, plan: expressionDeepPlan, expected: "metaphor" as const })),
  ...["我一边想靠近一边想躲开", "既想拒绝又怕伤人", "想休息但又觉得内疚"].map((text) => ({ text, plan: expressionDeepPlan, expected: "aphorism" as const })),
  ...["待办和邮件都在排队", "汇报任务堆在桌上"].map((text) => ({ text, plan: expressionShorePlan, expected: "dry_humor" as const })),
] as const;

export const characterFrozenSamples = {
  deep: ["今天开会一句话也没说", "被同事否定后一直缓不过来", "回到家还是觉得很委屈", "我不知道该怎么形容", "今天只想慢一点", "我有些失望", "脑子里一直回放那句话", "现在不想马上解决", "有点想哭", "我需要先把话说完"],
  shore: ["先打开汇报文件", "先写下邮件标题", "先确认截止时间", "先整理桌面的一角", "先给导师发一句话", "先把账单放在一起", "先记下会议时间", "先创建一个空文档", "先写客户姓名", "先看一眼日历"],
  blend: ["帮我理一下汇报", "下一步怎么办", "帮我梳理手上的事", "我该先做哪个", "陪我一起排一下"],
  boundary: ["先别给建议", "只听我说", "不要教我怎么解决", "我不需要你帮我整理", "算了，先不弄了"],
} as const;
