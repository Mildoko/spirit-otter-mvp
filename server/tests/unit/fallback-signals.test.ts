import { describe, expect, it } from "vitest";
import { extractFallbackSignals } from "../../src/modules/support/fallback-signals.js";

describe("auditable fallback signals", () => {
  it.each(["不知道先做哪个", "脑子转不动", "事情堆在一起"])("detects overload: %s", (text) => {
    const result = extractFallbackSignals(text);
    expect(result.overloadCueScore).toBeGreaterThanOrEqual(0.8);
    expect(result.ruleCodes?.some((code) => code.startsWith("OVERLOAD"))).toBe(true);
    expect(result.evidenceSpans[0]).toContain("[");
  });

  it("honors nearby negation", () => {
    const result = extractFallbackSignals("我并不着急，可以慢慢来");
    expect(result.urgencyScore).toBe(0.2);
    expect(result.ruleCodes).not.toContain("URGENT_TIME");
  });

  it("captures recovery language without inflating overload", () => {
    const result = extractFallbackSignals("现在理清楚一点了");
    expect(result.overloadCueScore).toBeLessThan(0.3);
    expect(result.sentimentPolarity).toBeGreaterThan(0);
  });
});
