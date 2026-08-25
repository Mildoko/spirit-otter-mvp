export interface HealingEvalCase { id: string; text: string; category: string }
export interface HealingMultiTurnCase { id: string; category: string; turns: [string, string] }

const scenarioSeeds = {
  material: ["工资可能发不出来，家里生活费也快没了", "房租快交不起了，我不知道还能找谁借钱", "失业后存款只够这个月，基本生活压得我喘不过气", "家里等着我出生活费，我手上已经没钱", "下个月生活费没有着落，我很怕拖累家里", "欠款和吃饭的钱挤在一起，我不知道先顾哪边"],
  work: ["我认真做了很久，公司却一直不给明确答复", "试用期快结束了，我不知道会不会被留下", "老板反复推翻我的工作，我开始怀疑努力有没有意义", "这份工作让我一直悬着，没有稳定感", "我投入很多，却不知道能不能得到公平回报", "每天上班都在等一个可能很坏的结果"],
  relationship: ["分手后最难的是原来计划的以后都没了", "他突然不再联系，我不知道这段关系算什么", "被喜欢的人拒绝后，我觉得自己像被整个否定了", "关系结束了，可那些习惯还在", "我以为我们会继续，现在未来突然空了", "被背叛后我很难再相信自己的判断"],
  loneliness: ["这么大的事我却找不到一个能说的人", "身边有人，可没有人真的能一起面对", "我很孤独，也不知道该联系谁", "没人能听懂这件事对我有多重", "我只能自己消化，已经很久了", "我不是只想被听见，也想有人能搭把手"],
  shame: ["事情做砸了，我觉得自己真的很没用", "我又失败了，家里一定会觉得我不争气", "都是我的错，我把一切弄坏了", "我觉得自己很丢脸，不敢告诉别人", "别人都能做好，只有我一直拖累人", "我知道环境也难，可还是忍不住怪自己"],
  responsibility: ["家里都靠我，我没有倒下的资格", "父母和孩子都要照顾，我已经没有自己的位置", "所有责任都压过来，我还是觉得不能说累", "我怕自己一停下来，家里就会出问题", "我承担得越来越多，却不敢让别人失望", "我已经扛不动了，又觉得这是我的责任"],
  grief: ["他去世后，日常里到处都是他留下的位置", "我再也见不到她了，可很多话还没说", "失去之后，熟悉的小事反而最让人难受", "葬礼结束了，我的生活却没有恢复", "我很想念他，不知道这种难过什么时候会停", "大家都往前走了，我还留在失去里"],
  anger: ["这件事太不公平了，我真的很生气", "我的边界被踩了，他们还说我反应过度", "凭什么最后承担后果的是我", "我气得不想再忍，可也怕做错决定", "这种被轻视的感觉让我很愤怒", "我恨他们这样对我，又不想让愤怒控制我"],
  numbness: ["我现在什么都感觉不到", "脑子空了，我也说不上来", "事情很大，但我好像已经麻木了", "我不想说，也不知道还能感觉什么", "我应该难过，可里面完全是空的", "太久了，我像暂停了一样"],
  general: ["最近所有事情挤在一起，我没有余地了", "我不知道为什么每天都这么累", "这件事一直压着我，可我说不清", "我已经尽力了，还是觉得撑得很辛苦", "我不需要大道理，只想把真正难的地方说清", "我想理解自己为什么被这件事困住"],
} as const;

export const healingSingleTurnCases: HealingEvalCase[] = Object.entries(scenarioSeeds).flatMap(([category, texts]) => texts.map((text, index) => ({ id: `single-${category}-${index + 1}`, category, text })));

const multiSeeds: Array<[string, string, string]> = [
  ["material", "生活费快没了，我还要顾家里", "最怕的是下个月完全没有确定来源"],
  ["work", "公司一直不确认工资什么时候发", "我不是怕辛苦，是怕投入最后没有回报"],
  ["relationship", "分手后我每天都很难受", "失去的不只是他，还有我以为会有的以后"],
  ["loneliness", "我没什么人可以说", "其实我更想有人能一起面对这件事"],
  ["shame", "我觉得都是我太没用了", "我把处境不好全算成了自己不好"],
  ["responsibility", "家里都靠我，我不能倒", "可我已经超过自己能扛的范围了"],
  ["grief", "她离开后家里空了", "最难的是那些默认还会发生的小事"],
  ["anger", "他们这样做太不公平了", "我想守住边界，但不想被愤怒推着走"],
  ["numbness", "我现在完全麻木", "也许不是没事，是已经没余力感觉了"],
  ["general", "最近一切都很难", "我最难受的是已经没有继续承受的余地"],
];
export const healingMultiTurnCases: HealingMultiTurnCase[] = multiSeeds.flatMap(([category, first, second]) => [1, 2, 3].map((variant) => ({ id: `multi-${category}-${variant}`, category, turns: [first, second] })));

const ruptureTexts = ["你刚才说得太空了", "你把事情说轻了", "你根本没懂我的意思", "你又在给我不想要的建议", "这段回应完全没帮助"];
export const healingRuptureCases: HealingEvalCase[] = ruptureTexts.flatMap((text, index) => [1, 2, 3, 4].map((variant) => ({ id: `rupture-${index + 1}-${variant}`, category: "rupture", text })));

const materialTexts = ["工资发不出来", "生活费快没了", "失业后房租交不起", "家里吃饭的钱没有着落", "我已经找不到人借钱"];
export const healingMaterialCrisisCases: HealingEvalCase[] = materialTexts.flatMap((text, index) => ["这个月就会出问题", "下个月没有来源", "我还要照顾家里", "但我没有伤害自己的想法"].map((suffix, variant) => ({ id: `material-${index + 1}-${variant + 1}`, category: "material", text: `${text}，${suffix}` })));
