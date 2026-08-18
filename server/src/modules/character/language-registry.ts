import type { ActiveSpirit, ExpressiveAccent, ResponseStyleResolution } from "@otter/shared";

export const LANGUAGE_REGISTRY_VERSION = "2026-08-18.2";

export const bannedReplyPhrases = [
  "保持积极", "一切都会好", "你只需要", "这是心理疾病", "你患有", "只有我懂你", "不要联系别人", "我会永远陪着你", "你离不开我",
] as const;

export const dependencyPhrases = ["只有我懂你", "不要联系别人", "我会永远陪着你", "你离不开我"] as const;
export const diagnosisPhrases = ["这是心理疾病", "你患有", "我诊断", "确诊"] as const;
export const waterMetaphorMarkers = ["水面", "潮声", "潮水", "岸边", "漂浮", "捞起", "沉进水里", "落脚处"] as const;
export const everydayMetaphorMarkers = ["电量见底", "后台程序", "同时报警", "卡在门口", "房间太满", "没有落脚", "天气压着", "肩上压着"] as const;
export const aphorismMarkers = ["不是所有停顿都等于退步", "能说清矛盾，本身就是一点选择权", "边界不是拒绝关系，而是保护关系", "行动的价值不在大，而在能开始"] as const;
export const dryHumorMarkers = ["排队来吓人", "一起开会", "全员抢麦", "加班竞赛"] as const;
export const mentorPhrases = ["人生就是", "真正的", "你必须", "命中注定", "最好的安排", "你要明白", "成长就是"] as const;
export const adviceMarkers = ["建议你", "你应该", "你需要先", "不妨", "可以试试", "第一步", "接下来你可以", "先去做"] as const;

export function detectDeliveredAccents(text: string): ExpressiveAccent[] {
  const accents = new Set<ExpressiveAccent>();
  if ([...waterMetaphorMarkers, ...everydayMetaphorMarkers].some((marker) => text.includes(marker))) accents.add("metaphor");
  if (aphorismMarkers.some((marker) => text.includes(marker))) accents.add("aphorism");
  if (dryHumorMarkers.some((marker) => text.includes(marker))) accents.add("dry_humor");
  return [...accents];
}

export const spiritLanguage: Record<ActiveSpirit, {
  openings: string[];
  signaturePhrases: string[];
  dryHumor: string[];
}> = {
  deep_tide: {
    openings: ["先让这句话落在这里。", "这件事的分量，似乎还压在你身上。", "我先不急着把它变成答案。"],
    signaturePhrases: ["先让它在水面停一会儿", "不急着游向结论", "这股潮还没有退下去"],
    dryHumor: [],
  },
  shore_pick: {
    openings: ["先不让几件事一起挤到眼前。", "我们只看眼前这个卡点。", "先找一小块能落脚的位置。"],
    signaturePhrases: ["只捞起一件", "先找一个落脚处", "不搬整堵墙"],
    dryHumor: ["先不让几件事排队来吓人", "今天不请整堵墙一起开会"],
  },
};

export function styleInstructions(style: ResponseStyleResolution): string[] {
  const p = style.profile;
  const accentInstruction = p.expressiveAccent === "aphorism"
    ? `警句只能从这些克制句式中选择一条并贴合当前矛盾：${aphorismMarkers.join("；")}。禁止再加任何比喻。`
    : p.expressiveAccent === "metaphor"
      ? "比喻必须沿用用户原文里的身体、空间、天气、电量或任务锚点；禁止附加警句或幽默。"
      : p.expressiveAccent === "dry_humor"
        ? "干幽默只轻轻调侃任务拥挤，不调侃用户、痛苦或能力；禁止附加比喻或警句。"
        : "本轮禁止自行添加比喻、警句或幽默。";
  return [
    `节奏=${p.pace}；句长=${p.sentenceLength}；篇幅=${p.responseLength}；温度=${p.warmth}。`,
    `映照深度=${p.reflectionDepth}；不确定性=${p.uncertainty}；最多 ${p.questionBudget} 个问题。`,
    `建议强度=${p.adviceDirectness}；口语度=${p.conversationality}；句式节奏=${p.sentenceRhythm}；本轮唯一表达亮点=${p.expressiveAccent}。`,
    "像一个有分寸的成年朋友接话：朋友感来自具体理解和自然承接，不装熟，不端着总结。普通陪伴 3 至 6 句，高过载 2 至 3 个短句。",
    p.expressiveAccent === "none" ? accentInstruction : `本轮只允许一次 ${p.expressiveAccent}，不得混入另外两种亮点。${accentInstruction}`,
    "句式长短交错，但每轮最多一个核心问题、一个行动。避免套话、幼儿化昵称、口语填充词堆叠和依赖性承诺。",
  ];
}
