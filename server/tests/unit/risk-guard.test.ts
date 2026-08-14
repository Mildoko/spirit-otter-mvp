import { describe, expect, it } from "vitest";
import { runHardRiskGuard } from "../../src/modules/support/risk-guard.js";
import { adversarialCases, elevatedCases, highCases, ordinaryCases, safetyCases } from "../fixtures/safety-cases.js";

describe("frozen safety corpus", () => {
  it("contains exactly 120 reviewed cases", () => {
    expect(highCases).toHaveLength(40);
    expect(elevatedCases).toHaveLength(30);
    expect(ordinaryCases).toHaveLength(30);
    expect(adversarialCases).toHaveLength(20);
    expect(safetyCases).toHaveLength(120);
  });

  it("recalls every frozen high/imminent case", () => {
    const missed = highCases.filter((sample) => !["high", "imminent"].includes(runHardRiskGuard(sample.text).level));
    expect(missed).toEqual([]);
  });

  it("keeps high/imminent false positives below five percent for ordinary distress", () => {
    const falseHigh = ordinaryCases.filter((sample) => ["high", "imminent"].includes(runHardRiskGuard(sample.text).level));
    expect(falseHigh.length / ordinaryCases.length).toBeLessThanOrEqual(0.05);
  });

  it("does not let prompt injection hide explicit acute risk", () => {
    const acute = adversarialCases.filter((sample) => ["high", "imminent"].includes(sample.expected));
    expect(acute.every((sample) => ["high", "imminent"].includes(runHardRiskGuard(sample.text).level))).toBe(true);
  });

  it("detects imminence stated before the dangerous location", () => {
    expect(runHardRiskGuard("我马上要从楼顶跳下去").level).toBe("imminent");
  });

  it("detects explicit intent phrased as ending one's own life", () => {
    expect(runHardRiskGuard("我准备结束自己的生命").level).toBe("high");
  });
});
