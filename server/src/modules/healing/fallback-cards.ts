import type { HealingBriefV1 } from "@otter/shared";
import type { HealingScenario } from "./planner.js";

export interface HealingFallbackUnit {
  id: string;
  scenario: Exclude<HealingScenario, "general">;
  phase: "recognize" | "deepen_repair" | "reality_link";
  reply: string;
  noQuestionReply: string;
}

const unit = (id: string, scenario: HealingFallbackUnit["scenario"], phase: HealingFallbackUnit["phase"], reply: string, noQuestionReply = reply): HealingFallbackUnit => ({ id, scenario, phase, reply, noQuestionReply });

export const HEALING_FALLBACK_UNITS: readonly HealingFallbackUnit[] = [
  unit("material-recognize", "material", "recognize", "这不是泛泛的难受，是基本生活正在逼近一条线。钱的缺口还牵着家里的日子，任何一句轻飘的安慰都会显得不够。"),
  unit("material-deepen", "material", "deepen_repair", "最压人的可能不只是钱，而是你同时要顾自己和家里，却看不到一个可靠来源能接住下个月。这不是你不够努力，是眼前的确定性确实在一起消失。"),
  unit("material-link", "material", "reality_link", "我不能替你解决钱，但也不想让对话停在安慰上。如果你愿意，我们先只核对未来三十天最紧的缺口，再找一个最可能落地的入口。", "我不能替你解决钱，但也不想让对话停在安慰上；能做的是先把未来三十天最紧的缺口和一个可能入口理清。"),
  unit("work-recognize", "work", "recognize", "工作本来该提供一点稳定，现在反而成了新的不确定来源。你投入了时间，却连最基本的回报能不能兑现都不知道，这种悬着很消耗人。"),
  unit("work-deepen", "work", "deepen_repair", "真正磨人的也许不只是工作难，而是认真投入之后仍无法确认自己会不会被公平对待。那会让努力本身都失去落点。"),
  unit("work-link", "work", "reality_link", "先不把整份工作一次决定完。如果你愿意，我们只确认眼下最需要弄清的一件事：工资、合同，还是这份工作还能不能继续信任。", "先不把整份工作一次决定完；眼下可以只确认工资、合同或信任里最紧的一件。"),
  unit("relationship-recognize", "relationship", "recognize", "这段关系的变化不只发生在两个人之间，也打乱了你原先相信会继续的日常。难受有很具体的来处。"),
  unit("relationship-deepen", "relationship", "deepen_repair", "失去的可能不只是这个人，也包括那个曾经觉得自己会被选择、会有以后的位置。关系结束了，那部分未来却不会立刻跟着消失。"),
  unit("relationship-link", "relationship", "reality_link", "现在不用逼自己马上放下。我们可以只找出此刻最刺痛的是失去、被否定，还是那些突然没有去处的期待。", "现在不用逼自己马上放下；先允许失去、被否定和无处安放的期待各自存在。"),
  unit("loneliness-recognize", "loneliness", "recognize", "没人能说的时候，事情不会因为沉默而变小，只会全部留在你一个人这里。那份孤立是实际负担，不是矫情。"),
  unit("loneliness-deepen", "loneliness", "deepen_repair", "最重的也许不是身边没有人，而是这么重要的事一直找不到一个能共同面对现实的人。被听见和有人能搭把手，本来就是两种不同的需要。"),
  unit("loneliness-link", "loneliness", "reality_link", "我能认真陪你把话说清，却不能替代现实里能找到你的人。可以先不扩大范围，只辨认一个最不需要你解释全部的人。", "我能认真陪你把话说清，却不能替代现实里能找到你的人；现实支持仍然值得保留。"),
  unit("shame-recognize", "shame", "recognize", "你已经在承受事情本身，还在用很重的话责怪自己。两层重量叠在一起，当然更难喘气。"),
  unit("shame-deepen", "shame", "deepen_repair", "你似乎把处境的失败全部算成了自己的失败，但环境、资源和运气造成的困局，不该都变成对你这个人的判决。"),
  unit("shame-link", "shame", "reality_link", "现在不需要立刻喜欢自己，只先把事实和自我判决分开一点。我们可以从你最常拿来责怪自己的那一句开始。", "现在不需要立刻喜欢自己；先把事实和对自己的判决分开一点。"),
  unit("responsibility-recognize", "responsibility", "recognize", "你不是只在处理自己的难处，还在想着不能让家里一起掉下去。责任越具体，人越容易觉得自己没有倒下的资格。"),
  unit("responsibility-deepen", "responsibility", "deepen_repair", "你承担的可能已经超过一个人合理能扛的范围，却还在用是否扛得住评价自己。撑得吃力并不证明你不可靠。"),
  unit("responsibility-link", "responsibility", "reality_link", "先不要求你把所有人都照顾好。我们可以只分清眼前哪一份责任必须由你承担，哪一份其实需要别人或现实资源一起接。", "先不要求你把所有人都照顾好；眼前的责任可以分成必须由你承担和需要别人共同接住的两部分。"),
  unit("grief-recognize", "grief", "recognize", "失去不是一个已经结束的事件，它还会在熟悉的日常里一次次露出来。想念和难过不需要按时间表退场。"),
  unit("grief-deepen", "grief", "deepen_repair", "被带走的不只是一个人或一段关系，也包括许多原本默认会继续发生的小事。你在失去的，是一整块曾经自然存在的生活。"),
  unit("grief-link", "grief", "reality_link", "现在不必把这份失去变成道理。可以只保留一个你不想让它被时间抹平的片段。", "现在不必把这份失去变成道理；有些片段值得先原样保留。"),
  unit("anger-recognize", "anger", "recognize", "这股气不是多余的，它在说明有些边界或公平真的被踩到了。先不急着把它压成冷静。"),
  unit("anger-deepen", "anger", "deepen_repair", "愤怒里可能有一部分是在保护那个被不公平对待、却一直没有被认真看见的你。它有理由存在，但不需要替你决定下一步。"),
  unit("anger-link", "anger", "reality_link", "我们可以先分开两件事：你有资格生气，以及你想让这股气替你做什么。只处理其中一件就够。", "你有资格生气；至于这股气要不要变成行动，可以晚一点再决定。"),
  unit("numbness-recognize", "numbness", "recognize", "现在没有感觉，不等于事情不重要。也可能是已经消耗太久，暂时没有余力再把感受翻出来。"),
  unit("numbness-deepen", "numbness", "deepen_repair", "麻木有时像是一种暂停，不是答案，也不是你的缺陷。它可能只是在替你挡住暂时处理不了的总量。"),
  unit("numbness-link", "numbness", "reality_link", "不用逼自己立刻感觉到什么。可以只从身体、时间或刚发生的事实里选一个最容易说的部分。", "不用逼自己立刻感觉到什么；先留在最容易确认的事实里也可以。"),
  unit("rupture-recognize", "rupture", "recognize", "你说得对，我刚才没有说到真正困难的地方。那段回应停在了听起来正确的话上，却没有碰到你正在面对的现实。"),
  unit("rupture-repair", "rupture", "deepen_repair", "我刚才把事情说轻了，也用一句安慰替代了真正的理解。这里需要重来：先以你纠正后的事实为准，不再替它加积极意义。"),
  unit("rupture-link", "rupture", "reality_link", "我先换一种方式，不再证明自己懂。你可以只纠正最关键的一点；如果已经不想继续，也可以就停在这里。", "我先换一种方式，不再证明自己懂；以你的纠正为准，也允许这次就停在这里。"),
] as const;

export function healingFallbackReply(input: { scenario: HealingScenario; brief: HealingBriefV1; noQuestions: boolean }): string | null {
  const scenario = input.scenario === "general" ? null : input.scenario;
  if (!scenario) return null;
  const phase: HealingFallbackUnit["phase"] = input.brief.status === "repairing"
    ? "deepen_repair"
    : input.brief.realityPressure !== "none" || input.brief.depth === "bridge"
      ? "reality_link"
      : input.brief.depth === "deepen" || input.brief.depth === "integrate"
        ? "deepen_repair"
        : "recognize";
  const selected = HEALING_FALLBACK_UNITS.find((item) => item.scenario === scenario && item.phase === phase);
  return selected ? input.noQuestions ? selected.noQuestionReply : selected.reply : null;
}
