import type { BootstrapData } from "./api";

export interface WelcomeMessageV1 {
  text: string;
  timeLabel: string | null;
}

export function buildWelcomeMessage(visit: BootstrapData["visit"], now = new Date(visit.currentVisitAt)): WelcomeMessageV1 {
  if (!visit.isReturning || !visit.previousVisitAt) {
    return { text: "嗨，我是 tata。你来了。", timeLabel: null };
  }
  const previous = new Date(visit.previousVisitAt);
  const elapsedHours = Math.max(0, (now.getTime() - previous.getTime()) / 3_600_000);
  if (elapsedHours < 4) return { text: "回来啦。刚才没说完的，也可以慢慢说。", timeLabel: "刚刚来过" };
  if (elapsedHours < 24 && previous.toDateString() === now.toDateString()) return { text: "今天又见到你了。想说什么，我都在听。", timeLabel: "上次是今天" };
  if (elapsedHours < 48) return { text: "又见到你了。昨天之后，今天过得怎么样？", timeLabel: "上次是昨天" };
  if (elapsedHours < 24 * 7) return { text: "有几天没见了。欢迎回来。", timeLabel: `大约 ${Math.max(2, Math.round(elapsedHours / 24))} 天前来过` };
  return { text: "好久不见。欢迎回来，不着急，我们慢慢来。", timeLabel: "有一阵子没见了" };
}
