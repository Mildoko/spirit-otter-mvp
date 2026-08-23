const currentDatePatterns = [
  /(?:今天|今日)(?:是)?(?:几月几日|几号|星期几|周几|什么日期|什么日子)/u,
  /(?:当前|现在)(?:是)?(?:什么日期|几月几日|几号)/u,
];

export function resolveCurrentDateReply(text: string, now: Date, timeZone: string): string | null {
  if (!currentDatePatterns.some((pattern) => pattern.test(text.trim()))) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return `今天是${value("year")}年${value("month")}月${value("day")}日，${value("weekday")}。`;
}
