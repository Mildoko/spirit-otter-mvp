import type { ResponsePlan, TopicCategory, TopicLeadGuidanceStateV1, TopicLeadSource } from "@otter/shared";

export const TOPIC_LEAD_VERSION = "topic-lead-v1";
export const TOPIC_CATALOG_VERSION = "topic-catalog-v1";

export type TopicForm = "thought_experiment" | "observation" | "story" | "fact" | "game" | "tradeoff" | "coauthor" | "future";

export interface TopicCard {
  id: string;
  category: TopicCategory;
  form: TopicForm;
  hook: string;
  contribution: string;
  followup: string;
  noQuestion: string;
  anchorKeywords: string[];
  sensitivity: "low";
  forbiddenDirections: string[];
}

const card = (input: Omit<TopicCard, "sensitivity" | "forbiddenDirections">): TopicCard => ({
  ...input,
  sensitivity: "low",
  forbiddenDirections: ["现实高风险决策", "心理或人格诊断", "创伤追问", "命运预测"],
});

export const topicCards: readonly TopicCard[] = [
  card({ id: "imagination_weather_door", category: "imagination", form: "thought_experiment", hook: "假设家里多了一扇门，每次打开都能通往一种固定天气。", contribution: "如果让我在这个设定里选，我会留住下过雨但还没完全放晴的傍晚。", followup: "你会把门设成哪一种天气？", noQuestion: "这扇门可以先停在这里，等一个具体天气自己冒出来。", anchorKeywords: ["门", "天气", "傍晚"] }),
  card({ id: "imagination_city_no_ads", category: "imagination", form: "thought_experiment", hook: "如果一座城市每天有一小时完全没有广告，会先发生什么变化？", contribution: "我猜最先变化的未必是商店，而是人终于会注意到墙面和路口原本的样子。", followup: "你觉得先变化的是街道，还是人的注意力？", noQuestion: "我愿意先把这一小时留给没有招牌的街道。", anchorKeywords: ["城市", "广告", "街道"] }),
  card({ id: "imagination_tiny_museum", category: "imagination", form: "thought_experiment", hook: "假设你可以开一家只展出三件普通物品的小博物馆。", contribution: "我会先放一张写到一半的纸条，因为未完成的东西通常比纪念品更会讲故事。", followup: "你的第一件展品会是什么？", noQuestion: "这家博物馆不用宏大，普通物品就足够撑起它。", anchorKeywords: ["博物馆", "展品", "物品"] }),
  card({ id: "imagination_sound_color", category: "imagination", form: "thought_experiment", hook: "如果所有声音都会在空气里留下颜色，城市早晨会是什么配色？", contribution: "我猜公交刹车是银灰色，早餐摊的锅铲声会是一串很亮的橙色。", followup: "你最想先看见哪一种声音？", noQuestion: "这个早晨可以先从银灰和橙色开始显影。", anchorKeywords: ["声音", "颜色", "早晨"] }),

  card({ id: "daily_best_small_sound", category: "daily_observation", form: "observation", hook: "有些很小的声音会让一天突然变得具体，比如钥匙落进碗里。", contribution: "我会把翻书时纸张轻轻弹回去的声音算进去，它很像一个小小的句号。", followup: "你会把哪种日常声音收进这个清单？", noQuestion: "日常里那些不抢镜的声音，其实很会保存时间。", anchorKeywords: ["声音", "日常", "钥匙"] }),
  card({ id: "daily_useless_object", category: "daily_observation", form: "observation", hook: "家里通常都有一件几乎没用、却一直舍不得丢的东西。", contribution: "它的价值可能不在用途，而在于它已经悄悄变成了房间历史的一部分。", followup: "你脑子里有没有立刻跳出一件？", noQuestion: "没用和没价值，经常不是一回事。", anchorKeywords: ["东西", "房间", "价值"] }),
  card({ id: "daily_window_frame", category: "daily_observation", form: "observation", hook: "同一扇窗在不同时间看出去，很像四幅完全不同的画。", contribution: "我偏爱刚亮灯但天还没黑透的十几分钟，室内和室外都没有完全赢。", followup: "你更喜欢窗外的哪个时段？", noQuestion: "天没黑透的那十几分钟，像是一天偷偷留下的夹层。", anchorKeywords: ["窗", "时间", "亮灯"] }),
  card({ id: "daily_queue_stories", category: "daily_observation", form: "observation", hook: "排队的时候，人会不自觉发明很多打发时间的小动作。", contribution: "有人反复看同一个页面，有人研究货架，我觉得这些动作像临时生成的个人仪式。", followup: "你排队时最常做什么？", noQuestion: "等待一旦有了小动作，就从空白变成了仪式。", anchorKeywords: ["排队", "等待", "动作"] }),

  card({ id: "culture_one_scene", category: "culture_story", form: "story", hook: "有些电影或书的情节已经忘了，却会剩下一幕一直不走。", contribution: "我觉得留下来的常常不是高潮，而是灯光、天气或一句没说完的话。", followup: "你有没有这样一幕？", noQuestion: "被记住的一幕不必负责概括整部作品。", anchorKeywords: ["电影", "书", "一幕"] }),
  card({ id: "culture_villain_dayoff", category: "culture_story", form: "story", hook: "如果经典故事里的反派突然有一天休假，故事可能会完全变样。", contribution: "我更想看他认真处理很普通的生活琐事，那会让宏大冲突突然漏一点气。", followup: "你想把哪位角色送去休假？", noQuestion: "反派去处理水电账单，可能比再打一场更有戏。", anchorKeywords: ["故事", "反派", "休假"] }),
  card({ id: "culture_title_first", category: "culture_story", form: "story", hook: "有些作品光凭标题就能在脑子里搭出一个世界。", contribution: "好标题像一扇只开了一条缝的门，不解释，却让人忍不住往里面看。", followup: "你记得哪个一看到就想点开的标题？", noQuestion: "标题留下一条缝，有时比简介说满更有效。", anchorKeywords: ["作品", "标题", "世界"] }),
  card({ id: "culture_side_character", category: "culture_story", form: "story", hook: "很多故事里，配角其实偷偷拥有另一部完整作品。", contribution: "我常觉得那个只出现几分钟、却有自己生活痕迹的人，最容易让世界变得可信。", followup: "你想把哪个配角拉出来当主角？", noQuestion: "把镜头移开一点，故事的边缘经常比中心更热闹。", anchorKeywords: ["故事", "配角", "主角"] }),

  card({ id: "knowledge_venus_day", category: "knowledge_curiosity", form: "fact", hook: "金星自转一圈所用的时间，比它绕太阳公转一周还长。", contribution: "这会让我们熟悉的“一天”和“一年”顺序突然变得很不可靠。", followup: "如果住在那种时间感里，你觉得日历还有什么用？", noQuestion: "只要换一颗行星，一天和一年的直觉就会被重新洗牌。", anchorKeywords: ["金星", "自转", "一年"] }),
  card({ id: "knowledge_octopus_hearts", category: "knowledge_curiosity", form: "fact", hook: "章鱼有三颗心脏，而且它们承担的循环工作并不完全相同。", contribution: "我喜欢这个事实，因为一种看起来很安静的动物，身体内部却像有一支小型协作队。", followup: "你还知道哪种动物有让人意外的身体设定？", noQuestion: "三颗心脏让章鱼像一台安静但结构奇特的机器。", anchorKeywords: ["章鱼", "心脏", "动物"] }),
  card({ id: "knowledge_bee_dance", category: "knowledge_curiosity", form: "fact", hook: "蜜蜂会用摆尾舞向同伴传递食物的大致方向和距离。", contribution: "这像是在蜂巢里画一张会动的地图，信息不是写出来的，而是跳出来的。", followup: "如果人类只能用动作留地图，你会先设计哪个动作？", noQuestion: "一张会动的地图，听起来比箭头更有生命。", anchorKeywords: ["蜜蜂", "舞", "地图"] }),
  card({ id: "knowledge_tomato_berry", category: "knowledge_curiosity", form: "fact", hook: "按植物学对果实的分类，番茄属于浆果，而草莓反而不属于真正的浆果。", contribution: "日常名字和科学分类偶尔会像两套各自合理、却互相拆台的标签系统。", followup: "你还遇到过哪种名字和实际分类反差很大的东西？", noQuestion: "名字负责好用，分类负责精确，它们偶尔不站在同一边。", anchorKeywords: ["番茄", "草莓", "浆果"] }),

  card({ id: "game_three_word_scene", category: "word_game", form: "game", hook: "来玩一个三词造景：电梯、月亮、橘子。", contribution: "我的版本是电梯门打开后没有楼层，只有一轮月亮和一只滚出来的橘子。", followup: "你会把这三个词拼成什么画面？", noQuestion: "电梯、月亮和橘子已经够搭出一个古怪开场。", anchorKeywords: ["电梯", "月亮", "橘子"] }),
  card({ id: "game_wrong_definition", category: "word_game", form: "game", hook: "试着给“周一”写一个完全不正确、但很像那么回事的解释。", contribution: "我的版本：周一是一种会把闹钟声音放大的天气现象。", followup: "你的错误定义是什么？", noQuestion: "把周一解释成天气现象，至少比把它当审判日轻一点。", anchorKeywords: ["周一", "定义", "天气"] }),
  card({ id: "game_one_sentence_mystery", category: "word_game", form: "game", hook: "一句话悬疑题：他每天都给空房间留一把伞。", contribution: "我先押一个不恐怖的答案：那间房的屋顶会漏雨，而他一直没空修。", followup: "你会给它补一个什么真相？", noQuestion: "空房间和一把伞，已经足够让故事开始偏航。", anchorKeywords: ["房间", "伞", "真相"] }),
  card({ id: "game_rename_object", category: "word_game", form: "game", hook: "如果“冰箱”这个名字从没存在过，我们得给它重新命名。", contribution: "我会叫它“冬天柜”，不精确，但一听就知道里面大概是什么脾气。", followup: "你会给冰箱取什么新名字？", noQuestion: "冬天柜这个名字笨一点，却很诚实。", anchorKeywords: ["冰箱", "名字", "冬天柜"] }),

  card({ id: "tradeoff_perfect_map", category: "preference_tradeoff", form: "tradeoff", hook: "二选一：永远不会迷路，或者永远不会排错队。", contribution: "我会选不迷路，因为走错方向带来的故事很多，但赶时间时一点也不浪漫。", followup: "你会选哪一个？", noQuestion: "不迷路和不排错队，分别拯救两种完全不同的耐心。", anchorKeywords: ["迷路", "排队", "选择"] }),
  card({ id: "tradeoff_repeat_meal", category: "preference_tradeoff", form: "tradeoff", hook: "二选一：一周早餐完全相同，或者每天早餐都由别人随机决定。", contribution: "我会选固定早餐，把惊喜额度留给更晚一点的时候。", followup: "你更愿意要稳定，还是随机？", noQuestion: "早餐里的稳定和惊喜，代价其实都不算小。", anchorKeywords: ["早餐", "稳定", "随机"] }),
  card({ id: "tradeoff_subtitles", category: "preference_tradeoff", form: "tradeoff", hook: "二选一：能听懂所有语言，或者能读懂所有时代留下的文字。", contribution: "我会选文字，因为那像一次性拿到无数封跨越时间的信。", followup: "你会把能力放在声音还是文字上？", noQuestion: "声音连接正在发生的世界，文字连接已经离开的世界。", anchorKeywords: ["语言", "文字", "时代"] }),
  card({ id: "tradeoff_room_view", category: "preference_tradeoff", form: "tradeoff", hook: "二选一：房间永远有完美光线，或者窗外永远有好看的景色。", contribution: "我会选光线，景色看久会习惯，光线却每天都在改变房间的脾气。", followup: "你的房间会选哪一项？", noQuestion: "景色负责远方，光线负责把眼前重新摆一遍。", anchorKeywords: ["房间", "光线", "景色"] }),

  card({ id: "coauthor_late_train", category: "creative_coauthoring", form: "coauthor", hook: "我们合写一个开头：末班车到站后，车上多了一位不在时刻表里的乘客。", contribution: "我先补一句：司机没有惊讶，只把后视镜往下压了一点。", followup: "你想让这位乘客带着什么？", noQuestion: "这位乘客先安静坐着，故事已经开始自己发出声音。", anchorKeywords: ["末班车", "乘客", "司机"] }),
  card({ id: "coauthor_shop_memory", category: "creative_coauthoring", form: "coauthor", hook: "我们合写一家只在雨天营业的店。", contribution: "我给它放一块木牌：这里不卖伞，只修补被雨淋坏的纸上东西。", followup: "你想让店里再多一样什么？", noQuestion: "这家店先留着潮湿纸张和木头的味道。", anchorKeywords: ["雨天", "店", "纸"] }),
  card({ id: "coauthor_robot_note", category: "creative_coauthoring", form: "coauthor", hook: "一个家务机器人第一次偷偷给主人留了张纸条。", contribution: "纸条上只有一句：今天桌上的灰尘排成了一张地图，所以我没擦。", followup: "主人看到后会怎么回？", noQuestion: "机器人第一次没有完成任务，却完成了一次观察。", anchorKeywords: ["机器人", "纸条", "地图"] }),
  card({ id: "coauthor_library_book", category: "creative_coauthoring", form: "coauthor", hook: "图书馆里出现了一本每天都会改变最后一页的书。", contribution: "管理员没有封存它，只规定读者不能在闭馆前五分钟翻到最后。", followup: "你觉得最后一页在等什么？", noQuestion: "会变化的最后一页，让每个读者都像迟到了一点。", anchorKeywords: ["图书馆", "书", "最后一页"] }),

  card({ id: "future_one_hour", category: "light_future", form: "future", hook: "想象十年后的普通一天，人们多出了一小时完全不被设备打扰的时间。", contribution: "我猜大家一开始会不习惯，后来城市里会重新长出一些没有用途的闲逛。", followup: "你觉得这一小时最可能被拿去做什么？", noQuestion: "多出来的一小时，最珍贵的地方也许正是没有用途。", anchorKeywords: ["十年后", "一小时", "设备"] }),
  card({ id: "future_pocket_translation", category: "light_future", form: "future", hook: "如果未来的翻译设备能保留语气，却故意留下每句话里最难翻的一小块。", contribution: "我觉得那一小块反而会提醒人：理解不是把差异全部磨平。", followup: "你希望它保留哪类不能直译的东西？", noQuestion: "最难翻的那一小块，可能正是语言最像自己的地方。", anchorKeywords: ["未来", "翻译", "语气"] }),
  card({ id: "future_public_rooftop", category: "light_future", form: "future", hook: "如果未来每栋楼的屋顶都必须留出一半做公共空间。", contribution: "我希望它们不是统一花园，而是有人晒被子、有人看云、有人种葱的混合地带。", followup: "你会给屋顶留一个什么角落？", noQuestion: "屋顶不必精致，能让不同生活同时发生就很好。", anchorKeywords: ["未来", "屋顶", "公共空间"] }),
  card({ id: "future_slow_delivery", category: "light_future", form: "future", hook: "如果未来出现一种“故意慢送”的服务，包裹会沿途记录它见过的地方。", contribution: "我会愿意等一本书慢慢过来，拆包时顺便读它的旅行日志。", followup: "你会让什么东西用这种方式寄来？", noQuestion: "有些东西慢一点到，路程就不再只是损耗。", anchorKeywords: ["未来", "包裹", "旅行"] }),
];

export interface TopicLeadTurn {
  phase: "open" | "switch" | "continue";
  card: TopicCard;
  nextState: TopicLeadGuidanceStateV1;
  fallbackReply: string;
  promptContext: string;
  suppressMemory: boolean;
  previousTopicId: string | null;
  previousCategory: TopicCategory | null;
}

const inactiveWithHistory = (previous: TopicLeadGuidanceStateV1): TopicLeadGuidanceStateV1 => ({
  status: "inactive", source: null, currentTopicId: null, currentCategory: null,
  startedAtTurn: null, lastActivityTurn: null,
  recentTopicIds: [...previous.recentTopicIds].slice(-6), recentCategories: [...previous.recentCategories].slice(-2), rejectionCount: 0,
});

export function deactivateTopicLead(previous: TopicLeadGuidanceStateV1): TopicLeadGuidanceStateV1 {
  return inactiveWithHistory(previous);
}

export function getTopicCard(id: string | null): TopicCard | null {
  return id ? topicCards.find((item) => item.id === id) ?? null : null;
}

export function selectTopicCard(previous: TopicLeadGuidanceStateV1, forceDifferentCategory: boolean, random: () => number = Math.random): TopicCard {
  const recentIds = new Set(previous.recentTopicIds);
  const recentCategories = new Set(previous.recentCategories);
  const currentForm = getTopicCard(previous.currentTopicId)?.form ?? null;
  let candidates = topicCards.filter((item) => !recentIds.has(item.id) && (!forceDifferentCategory || item.category !== previous.currentCategory));
  const cooled = candidates.filter((item) => !recentCategories.has(item.category));
  if (cooled.length > 0) candidates = cooled;
  if (previous.rejectionCount >= 2 && currentForm) {
    const changedForm = candidates.filter((item) => item.form !== currentForm);
    if (changedForm.length > 0) candidates = changedForm;
  }
  if (candidates.length === 0) candidates = topicCards.filter((item) => !recentIds.has(item.id));
  if (candidates.length === 0) throw new Error("话题库不足以满足最近六个话题不重复的约束");
  const rawIndex = Math.floor(random() * candidates.length);
  return candidates[Math.min(Math.max(rawIndex, 0), candidates.length - 1)]!;
}

function renderCard(cardValue: TopicCard, phase: "open" | "switch", noQuestions: boolean): string {
  const lead = phase === "switch" ? "换一个。" : "行，换个频道。";
  return `${lead}${cardValue.hook}${cardValue.contribution}${noQuestions ? cardValue.noQuestion : cardValue.followup}`;
}

const continuationLines: Record<TopicCategory, string> = {
  imagination: "顺着你这条线，这个设定已经开始有自己的规则了。",
  daily_observation: "这个角度让一件很普通的小事突然有了细节。",
  culture_story: "你抓到的这一点，很适合继续长成故事的另一面。",
  knowledge_curiosity: "这个事实一旦和日常直觉放在一起，就会变得更有意思。",
  word_game: "你这一笔把游戏往前推了，而且没有走最容易猜的路线。",
  preference_tradeoff: "这个选择背后藏着一套很清楚的取舍。",
  creative_coauthoring: "好，这一笔算你的；我来接住它，再给故事留一点空间。",
  light_future: "这个未来版本没有急着炫技，反而更像真的会被人使用。",
};

function renderContinuation(cardValue: TopicCard, noQuestions: boolean): string {
  const line = continuationLines[cardValue.category];
  return noQuestions ? `${line}${cardValue.noQuestion}` : `${line}${cardValue.followup}`;
}

export function resolveTopicLeadTurn(input: {
  plan: ResponsePlan;
  previous: TopicLeadGuidanceStateV1;
  turnIndex: number;
  source: TopicLeadSource;
  noQuestions: boolean;
  random?: () => number;
}): TopicLeadTurn | null {
  if (!["open_topic", "switch_topic", "continue_topic"].includes(input.plan.primaryStrategy)) return null;
  const requestedPhase = input.plan.primaryStrategy === "switch_topic" ? "switch" : input.plan.primaryStrategy === "continue_topic" ? "continue" : "open";
  const current = getTopicCard(input.previous.currentTopicId);
  const needsSelection = requestedPhase !== "continue" || input.previous.status !== "active" || current === null;
  const cardValue = needsSelection ? selectTopicCard(input.previous, requestedPhase === "switch", input.random) : current;
  const phase = needsSelection && requestedPhase === "continue" ? "open" : requestedPhase;
  const recentTopicIds = needsSelection ? [...input.previous.recentTopicIds, cardValue.id].slice(-6) : [...input.previous.recentTopicIds].slice(-6);
  const recentCategories = needsSelection ? [...input.previous.recentCategories, cardValue.category].slice(-2) : [...input.previous.recentCategories].slice(-2);
  const nextState: TopicLeadGuidanceStateV1 = {
    status: "active",
    source: input.previous.status === "active" && input.previous.source ? input.previous.source : input.source,
    currentTopicId: cardValue.id,
    currentCategory: cardValue.category,
    startedAtTurn: input.previous.status === "active" && input.previous.startedAtTurn !== null ? input.previous.startedAtTurn : input.turnIndex,
    lastActivityTurn: input.turnIndex,
    recentTopicIds,
    recentCategories,
    rejectionCount: phase === "switch" ? Math.min(99, input.previous.rejectionCount + 1) : phase === "open" ? 0 : input.previous.rejectionCount,
  };
  const fallbackReply = phase === "continue" ? renderContinuation(cardValue, input.noQuestions) : renderCard(cardValue, phase, input.noQuestions);
  const promptContext = [
    `## 主动带聊（${TOPIC_LEAD_VERSION}｜${TOPIC_CATALOG_VERSION}）`,
    `阶段=${phase}；话题ID=${cardValue.id}；分类=${cardValue.category}；形式=${cardValue.form}`,
    `固定话题钩子=${cardValue.hook}`,
    `鹿禅的内容贡献=${cardValue.contribution}`,
    `后续空间=${input.noQuestions ? cardValue.noQuestion : cardValue.followup}`,
    `必须自然保留这些锚点中的至少一个：${cardValue.anchorKeywords.join("、")}`,
    "不要更换话题，不要分析用户为什么无聊，不要只采访用户，不要给行动建议，不要提及内部模式。",
  ].join("\n");
  return {
    phase, card: cardValue, nextState, fallbackReply, promptContext, suppressMemory: phase !== "continue",
    previousTopicId: input.previous.currentTopicId,
    previousCategory: input.previous.currentCategory,
  };
}
