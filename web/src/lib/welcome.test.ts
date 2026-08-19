import { describe, expect, it } from "vitest";
import { buildWelcomeMessage } from "./welcome";

const now = new Date("2026-08-19T12:00:00.000Z");
const visit = (previousVisitAt?: string, isReturning = true) => ({ visitId: "visit", currentVisitAt: now.toISOString(), ...(previousVisitAt ? { previousVisitAt } : {}), isReturning });

describe("tata welcome message", () => {
  it("welcomes a first visit without pretending to remember", () => {
    expect(buildWelcomeMessage(visit(undefined, false), now).text).toContain("我是 tata");
  });

  it("uses friendly time bands for returning visits", () => {
    expect(buildWelcomeMessage(visit("2026-08-19T10:00:00.000Z"), now).timeLabel).toBe("刚刚来过");
    expect(buildWelcomeMessage(visit("2026-08-18T12:00:00.000Z"), now).timeLabel).toBe("上次是昨天");
    expect(buildWelcomeMessage(visit("2026-08-15T12:00:00.000Z"), now).text).toContain("有几天没见");
  });
});
