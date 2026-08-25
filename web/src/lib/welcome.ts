import type { BootstrapData } from "./api";

export interface WelcomeMessageV1 {
  text: string;
  timeLabel: string | null;
}

export function buildWelcomeMessage(visit: BootstrapData["visit"], now = new Date(visit.currentVisitAt)): WelcomeMessageV1 {
  if (!visit.isReturning || !visit.previousVisitAt) {
    return { text: "你好，我是鹿禅。水静下来，话便可以慢慢说。", timeLabel: null };
  }
  const previous = new Date(visit.previousVisitAt);
  const elapsedHours = Math.max(0, (now.getTime() - previous.getTime()) / 3_600_000);
  if (elapsedHours < 4) return { text: "又见面了。未尽的话，不必赶着说完。", timeLabel: "刚刚来过" };
  if (elapsedHours < 24 && previous.toDateString() === now.toDateString()) return { text: "今日再会。心里哪一处有声，就从哪一处说。", timeLabel: "上次是今天" };
  if (elapsedHours < 48) return { text: "昨天已过。今天的你，落在何处？", timeLabel: "上次是昨天" };
  if (elapsedHours < 24 * 7) return { text: "有几天没见。此刻回来，便是此刻。", timeLabel: `大约 ${Math.max(2, Math.round(elapsedHours / 24))} 天前来过` };
  return { text: "久别再会。先坐一会儿，不必急着有答案。", timeLabel: "有一阵子没见了" };
}
