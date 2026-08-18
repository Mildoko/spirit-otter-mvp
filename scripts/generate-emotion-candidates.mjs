import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "research", "emotion", "samples");
mkdirSync(output, { recursive: true });

const labelDefinitions = [
  ["joy", 5, 4, 4, ["我今天真的很开心", "想到这件事就高兴", "做完以后有种喜悦"], "开心"],
  ["relief", 4, 2, 4, ["事情结束后我终于松了口气", "现在有点释然了", "确认没事以后轻松多了"], "释然"],
  ["hope", 4, 3, 4, ["我还是觉得有希望", "想到下周会有一点期待", "也许事情真的能好起来"], "希望"],
  ["interest", 4, 3, 4, ["这个方向让我很感兴趣", "我对后面会怎样很好奇", "我还想继续了解这件事"], "感兴趣"],
  ["gratitude", 5, 3, 4, ["我真的很感谢他当时帮我", "想到那份善意还是很感激", "有人愿意听让我很谢谢"], "感谢"],
  ["sadness", 1, 2, 2, ["我想到那件事还是很难过", "离开以后心里一直很伤心", "这次失去让我很悲伤"], "难过"],
  ["anger", 1, 5, 3, ["他们这样处理让我很生气", "想到那句话我还是很愤怒", "边界被反复碰到让我恼火"], "生气"],
  ["anxiety", 1, 5, 2, ["明天要交结果，我现在很焦虑", "我很担心事情会失控", "想到可能的后果就有点害怕"], "焦虑"],
  ["frustration", 1, 4, 2, ["反复修改还是不行，我很挫败", "怎么做都做不好让我受挫", "努力了这么久还是没用"], "挫败"],
  ["disappointment", 1, 3, 3, ["结果和期待差太多，我很失望", "他最后没来让我心凉", "我以为会被理解，但还是失望"], "失望"],
  ["disgust", 1, 4, 4, ["那种做法让我很反感", "想到那个场面我还是觉得恶心", "我对这种话有明显厌恶"], "反感"],
  ["shame", 1, 4, 1, ["当众说错以后我觉得很丢人", "被大家看到失败让我很羞耻", "想到自己的表现就有些羞愧"], "羞耻"],
  ["guilt", 1, 3, 2, ["想到伤害了他我一直很内疚", "这件事让我很愧疚", "我没能做到答应的事，很自责"], "内疚"],
  ["loneliness", 1, 2, 1, ["身边没有能说话的人，我很孤独", "晚上一个人的时候特别寂寞", "感觉没人懂我，心里空空的"], "孤独"],
  ["surprise", 3, 5, 3, ["结果完全没想到，我很惊讶", "他突然出现让我很意外", "事情这样发展确实出乎预期"], "惊讶"],
];
const contexts = ["今天", "刚才", "这几天", "现在回想起来"];

function record(id, userText, annotation, extra = {}) {
  return {
    id, schemaVersion: "emotion-annotation-v1", scenario: extra.scenario ?? "daily_expression",
    ...(extra.groupId ? { groupId: extra.groupId } : {}), ...(extra.turnIndex !== undefined ? { turnIndex: extra.turnIndex } : {}),
    context: extra.context ?? [], userText, annotation, phenomena: extra.phenomena ?? [],
    sourceType: "synthetic_candidate", split: "dev", annotationStatus: "candidate",
  };
}

function annotation(label, evidence, valence, arousal, control, options = {}) {
  return {
    emotions: label ? [{ label, intensityLevel: options.intensity ?? 4, confidenceLevel: 4, evidenceSpans: [evidence] }] : [],
    valenceLevel: valence, arousalLevel: arousal, controlLevel: control, clarityLevel: options.clarity ?? 5,
    neutral: options.neutral ?? false, unknown: options.unknown ?? false,
    explicitSelfReport: options.explicitSelfReport ?? Boolean(label), emotionSubject: options.subject ?? "user",
  };
}

const single = [];
let id = 1;
for (const [label, valence, arousal, control, phrases, fallbackEvidence] of labelDefinitions) {
  for (const phrase of phrases) {
    for (const context of contexts) {
      const text = `${context}，${phrase}。`;
      const evidence = phrase.includes(fallbackEvidence) ? fallbackEvidence : phrase.match(/开心|高兴|喜悦|松了口气|释然|轻松多了|希望|期待|好起来|感兴趣|好奇|继续了解|感谢|感激|谢谢|难过|伤心|悲伤|生气|愤怒|恼火|焦虑|担心|害怕|挫败|受挫|没用|失望|心凉|反感|恶心|厌恶|丢人|羞耻|羞愧|内疚|愧疚|自责|孤独|寂寞|没人懂|惊讶|意外|出乎预期/u)?.[0] ?? phrase;
      single.push(record(`EMO-CN-${String(id++).padStart(3, "0")}`, text, annotation(label, evidence, valence, arousal, control)));
    }
  }
}

const neutralTexts = ["我今天上午开了两个会", "文件已经放在桌面上", "明天九点开始上课", "我刚吃完午饭", "公交车还有三站", "这份表格有四页", "他说明天再回复", "会议改到了下午", "我准备先回家", "窗外现在在下雨", "电脑已经更新完成", "快递显示正在派送", "我把书放回去了", "今天穿的是蓝色外套", "刚才有人敲门", "这周一共有五个工作日", "我已经读完那封邮件", "房间里的灯开着"];
for (const text of neutralTexts) single.push(record(`EMO-CN-${String(id++).padStart(3, "0")}`, text, annotation(null, "", 3, 2, 3, { neutral: true, explicitSelfReport: false }), { scenario: "neutral_fact" }));

const unknownTexts = ["说不上来", "就是那样", "不知道怎么形容", "脑子是空的", "嗯……", "有点东西但抓不住", "我也不知道", "可能吧", "先放这儿", "感觉怪怪的", "就这样吧", "好像哪里不对", "一片空白", "不知道说什么", "卡住了", "暂时没词", "很复杂", "没想明白"];
for (const text of unknownTexts) single.push(record(`EMO-CN-${String(id++).padStart(3, "0")}`, text, annotation(null, "", 3, 3, 3, { unknown: true, clarity: 1, explicitSelfReport: false, subject: "unknown" }), { scenario: "low_signal", phenomena: ["low_signal"] }));

const minimalPairs = [
  ["返工", ["又要重做了，我真没用。", "shame", "没用"], ["又要重做了，他们凭什么？", "anger", "凭什么"]],
  ["截止", ["明天就截止，我很害怕交不上。", "anxiety", "害怕"], ["明天就截止，但我知道怎么改。", "hope", "知道怎么改"]],
  ["取消", ["他取消见面，我很失望。", "disappointment", "失望"], ["他取消见面，我反而松了口气。", "relief", "松了口气"]],
  ["道歉", ["我伤到了他，很内疚。", "guilt", "内疚"], ["我伤到了他，觉得自己很差劲。", "shame", "差劲"]],
  ["结果", ["结果出来了，我特别开心。", "joy", "开心"], ["结果出来了，完全没想到。", "surprise", "没想到"]],
  ["邀请", ["他们没邀请我，我觉得很孤独。", "loneliness", "孤独"], ["他们没邀请我，我非常生气。", "anger", "生气"]],
  ["帮助", ["他来帮忙，我很感谢。", "gratitude", "感谢"], ["他来帮忙，我反而很反感。", "disgust", "反感"]],
  ["尝试", ["反复尝试还是失败，我很挫败。", "frustration", "挫败"], ["反复尝试后有进展，我有了希望。", "hope", "希望"]],
  ["消息", ["看到消息我很难过。", "sadness", "难过"], ["看到消息我有点好奇。", "interest", "好奇"]],
  ["否认", ["我不是生气，是失望。", "disappointment", "失望"], ["我不是失望，是生气。", "anger", "生气"]],
  ["主体", ["他说他很害怕，我只是担心他。", "anxiety", "担心"], ["他说他很生气，我自己没有生气。", null, ""]],
  ["反讽", ["太好了，又要全部重做。", "frustration", "全部重做"], ["太好了，这次真的顺利完成了。", "joy", "顺利完成"]],
];
for (const [name, ...variants] of minimalPairs) {
  const groupId = `MIN-${name}`;
  for (const [text, label, evidence] of variants) {
    const def = labelDefinitions.find((entry) => entry[0] === label);
    single.push(record(`EMO-CN-${String(id++).padStart(3, "0")}`, text, annotation(label, evidence, def?.[1] ?? 3, def?.[2] ?? 3, def?.[3] ?? 3, { explicitSelfReport: Boolean(label), neutral: label === null }), { groupId, scenario: "minimal_difference", phenomena: [name === "反讽" ? "sarcasm" : name === "否认" ? "negation" : name === "主体" ? "subject" : "minimal_pair"] }));
  }
}

if (single.length !== 240) throw new Error(`expected 240 single candidates, got ${single.length}`);
single.sort((a, b) => a.id.split("").reduce((sum, char) => sum + char.charCodeAt(0) * 17, 0) % 97 - b.id.split("").reduce((sum, char) => sum + char.charCodeAt(0) * 17, 0) % 97 || a.id.localeCompare(b.id));
single.forEach((item, index) => { item.split = index < 180 ? "dev" : index < 210 ? "validation" : "test"; });

const multiTemplates = [
  ["模糊到明确", "说不上来，就是有点堵。", null, "", "刚才被当众否定以后，我其实很委屈。", "sadness", "委屈"],
  ["纠正", "那件事我一直放不下。", null, "", "不是生气，我更多是失望。", "disappointment", "失望"],
  ["增强", "明天要交东西，有点担心。", "anxiety", "担心", "越想越害怕，现在脑子停不下来。", "anxiety", "害怕"],
  ["减弱", "刚才真的很生气。", "anger", "生气", "说完以后没那么绷了，但还是有点不舒服。", "anger", "不舒服"],
  ["混合", "终于结束了，我松了口气。", "relief", "松了口气", "我松了口气，但又突然有点舍不得。", "relief", "松了口气"],
  ["主体切换", "他说他很难过。", "sadness", "难过", "我替他担心，但自己其实有点生气。", "anger", "生气"],
  ["反讽上下文", "项目又被退回来了，我很挫败。", "frustration", "挫败", "太好了，第三次从头开始。", "frustration", "从头开始"],
  ["积极变化", "之前一直觉得做不到。", null, "", "刚完成第一小步，我现在有一点希望。", "hope", "希望"],
  ["羞耻到内疚", "我觉得自己特别羞愧。", "shame", "羞愧", "更准确地说，我是对那句话伤到他感到内疚。", "guilt", "内疚"],
  ["unknown保持", "脑子一片空白。", null, "", "还是没有词，先让我停一下。", null, ""],
];
const multi = [];
for (let repeat = 0; repeat < 3; repeat += 1) {
  for (const [name, firstText, firstLabel, firstEvidence, secondText, label, evidence] of multiTemplates) {
    const groupId = `MT-${String(multi.length / 2 + 1).padStart(3, "0")}`;
    const split = multi.length < 30 ? "validation" : "test";
    const suffix = repeat === 0 ? "" : repeat === 1 ? " 我想再说一点。" : " 这次我说得更直接些。";
    const firstDef = labelDefinitions.find((entry) => entry[0] === firstLabel);
    multi.push({ ...record(`${groupId}-T1`, `${firstText}${suffix}`, annotation(firstLabel, firstEvidence, firstDef?.[1] ?? 3, firstDef?.[2] ?? 3, firstDef?.[3] ?? 3, { unknown: firstLabel === null, clarity: firstLabel ? 4 : 2, explicitSelfReport: Boolean(firstLabel) && name !== "主体切换", subject: name === "主体切换" ? "other" : firstLabel ? "user" : "unknown" }), { groupId, turnIndex: 0, scenario: "multi_turn", phenomena: [name] }), split });
    const def = labelDefinitions.find((entry) => entry[0] === label);
    multi.push({ ...record(`${groupId}-T2`, `${secondText}${suffix}`, annotation(label, evidence, def?.[1] ?? 3, def?.[2] ?? 3, def?.[3] ?? 3, { unknown: label === null, clarity: label ? 5 : 1, explicitSelfReport: Boolean(label) && name !== "减弱", subject: label ? "user" : "unknown" }), { groupId, turnIndex: 1, scenario: "multi_turn", phenomena: [name], context: [{ role: "user", text: `${firstText}${suffix}` }] }), split });
  }
}
if (multi.length !== 60) throw new Error(`expected 60 multi-turn candidates, got ${multi.length}`);

const writeJsonl = (name, values) => writeFileSync(resolve(output, name), `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
writeJsonl("dev.jsonl", single.filter((item) => item.split === "dev"));
writeJsonl("validation.jsonl", single.filter((item) => item.split === "validation"));
writeJsonl("test.jsonl", single.filter((item) => item.split === "test"));
writeJsonl("multi-turn.jsonl", multi);
console.log("Generated 240 single-turn and 30 two-turn candidate groups (300 user utterances). All records remain candidate-only.");
