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

  it.each(["不知道说什么", "脑子空了", "这会儿没接上电"])("detects low expression clarity with evidence: %s", (text) => {
    const result = extractFallbackSignals(text);
    expect(result.expressionClarityScore).toBeLessThan(0.45);
    expect(result.ruleCodes).toContain("LOW_EXPRESSION_CLARITY");
    expect(result.evidenceSpans.join(" ")).toMatch(/不知道说什么|脑子空|没接上电/u);
  });

  it("separates tentative, direct, and declined readiness", () => {
    expect(extractFallbackSignals("如果只是理小一点也行").progressReadinessScore).toBeGreaterThanOrEqual(0.45);
    expect(extractFallbackSignals("直接给我一个动作").progressReadinessScore).toBeGreaterThanOrEqual(0.7);
    expect(extractFallbackSignals("先不弄了").progressReadinessScore).toBeLessThan(0.45);
  });
});
