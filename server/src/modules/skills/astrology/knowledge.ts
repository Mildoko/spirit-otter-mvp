export const ASTROLOGY_KNOWLEDGE_VERSION = "astrology-knowledge-v1.1";

export interface ZodiacSignKnowledge {
  id: string;
  name: string;
  dateRange: string;
  element: "火" | "土" | "风" | "水";
  modality: "开创" | "固定" | "变动";
  themes: string[];
}

export const zodiacSigns: readonly ZodiacSignKnowledge[] = [
  { id: "aries", name: "白羊座", dateRange: "3月21日—4月19日", element: "火", modality: "开创", themes: ["直接", "启动力", "竞争心"] },
  { id: "taurus", name: "金牛座", dateRange: "4月20日—5月20日", element: "土", modality: "固定", themes: ["稳定", "感官体验", "耐心"] },
  { id: "gemini", name: "双子座", dateRange: "5月21日—6月21日", element: "风", modality: "变动", themes: ["好奇", "交流", "多样性"] },
  { id: "cancer", name: "巨蟹座", dateRange: "6月22日—7月22日", element: "水", modality: "开创", themes: ["照顾", "归属", "情感记忆"] },
  { id: "leo", name: "狮子座", dateRange: "7月23日—8月22日", element: "火", modality: "固定", themes: ["表达", "创造", "被看见"] },
  { id: "virgo", name: "处女座", dateRange: "8月23日—9月22日", element: "土", modality: "变动", themes: ["辨别", "改进", "实用"] },
  { id: "libra", name: "天秤座", dateRange: "9月23日—10月23日", element: "风", modality: "开创", themes: ["关系", "平衡", "审美"] },
  { id: "scorpio", name: "天蝎座", dateRange: "10月24日—11月22日", element: "水", modality: "固定", themes: ["深度", "边界", "转化"] },
  { id: "sagittarius", name: "射手座", dateRange: "11月23日—12月21日", element: "火", modality: "变动", themes: ["探索", "意义", "自由"] },
  { id: "capricorn", name: "摩羯座", dateRange: "12月22日—1月19日", element: "土", modality: "开创", themes: ["结构", "责任", "长期主义"] },
  { id: "aquarius", name: "水瓶座", dateRange: "1月20日—2月18日", element: "风", modality: "固定", themes: ["独立", "群体", "新观点"] },
  { id: "pisces", name: "双鱼座", dateRange: "2月19日—3月20日", element: "水", modality: "变动", themes: ["想象", "共情", "流动"] },
] as const;

const boundaryDates = new Set(["1-19", "1-20", "2-18", "2-19", "3-20", "3-21", "4-19", "4-20", "5-20", "5-21", "6-21", "6-22", "7-22", "7-23", "8-22", "8-23", "9-22", "9-23", "10-23", "10-24", "11-22", "11-23", "12-21", "12-22"]);

export function mentionedSigns(text: string): ZodiacSignKnowledge[] {
  return zodiacSigns.filter((sign) => text.includes(sign.name) || text.includes(sign.name.replace("座", "")));
}

export type MonthDayInput =
  | { kind: "absent" }
  | { kind: "invalid"; month: number; day: number }
  | { kind: "valid"; month: number; day: number; boundary: boolean };

export function classifyMonthDay(text: string): MonthDayInput {
  const match = text.match(/(?<!\d)(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*(?:日|号)?/u);
  if (!match) return { kind: "absent" };
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1) return { kind: "invalid", month, day };
  const daysInMonth = new Date(2024, month, 0).getDate();
  if (day > daysInMonth) return { kind: "invalid", month, day };
  return { kind: "valid", month, day, boundary: boundaryDates.has(`${month}-${day}`) };
}

export function parseMonthDay(text: string): { month: number; day: number; boundary: boolean } | null {
  const parsed = classifyMonthDay(text);
  return parsed.kind === "valid" ? parsed : null;
}

export function conventionalSunSign(month: number, day: number): ZodiacSignKnowledge {
  const key = month * 100 + day;
  const ranges: Array<[number, number, string]> = [
    [321, 419, "aries"], [420, 520, "taurus"], [521, 621, "gemini"], [622, 722, "cancer"],
    [723, 822, "leo"], [823, 922, "virgo"], [923, 1023, "libra"], [1024, 1122, "scorpio"],
    [1123, 1221, "sagittarius"],
  ];
  const id = key >= 1222 || key <= 119 ? "capricorn" : key >= 120 && key <= 218 ? "aquarius" : key >= 219 && key <= 320 ? "pisces" : ranges.find(([start, end]) => key >= start && key <= end)?.[2] ?? "pisces";
  return zodiacSigns.find((sign) => sign.id === id)!;
}

export function knowledgeForPrompt(text: string): string {
  const signs = mentionedSigns(text);
  const date = classifyMonthDay(text);
  if (date.kind === "invalid") {
    return `本地知识版本=${ASTROLOGY_KNOWLEDGE_VERSION}。用户输入的 ${date.month}月${date.day}日 不是有效公历日期，因此没有对应星座。必须直接指出日期无效，禁止把它归到任何星座或作为玩梗延伸。`;
  }
  if (date.kind === "valid") {
    const sign = conventionalSunSign(date.month, date.day);
    return `本地知识版本=${ASTROLOGY_KNOWLEDGE_VERSION}。常见日期范围把 ${date.month}月${date.day}日 归为${sign.name}（${sign.dateRange}）。${date.boundary ? "这是边界日期，年份、时区和具体出生时刻可能影响精确太阳位置，只能说常见范围。" : "不需要出生时间或地点。"}`;
  }
  const selected = signs.length ? signs : zodiacSigns;
  return `本地知识版本=${ASTROLOGY_KNOWLEDGE_VERSION}。${selected.map((sign) => `${sign.name}：${sign.dateRange}，${sign.element}象、${sign.modality}，常见话题=${sign.themes.join("、")}`).join("；")}`;
}
