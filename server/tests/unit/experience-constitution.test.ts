import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_CONSTITUTION_VERSION,
  experienceInvariants,
  experiencePriorityOrder,
  renderExperiencePromptContract,
  renderSafetyExperienceContract,
  validateExperienceConstitution,
} from "../../src/product/experience-constitution.js";

describe("product experience constitution", () => {
  it("keeps the versioned priority order and complete invariant registry", () => {
    expect(EXPERIENCE_CONSTITUTION_VERSION).toBe("experience-v1");
    expect(experiencePriorityOrder).toEqual(["safety_and_reality", "core_experience", "product_policy", "eval_metrics"]);
    expect(experienceInvariants.map((item) => item.id)).toEqual([
      "EX-01", "EX-02", "EX-03", "EX-04", "EX-05", "EX-06", "EX-07", "EX-08", "EX-09", "EX-10",
    ]);
    expect(() => validateExperienceConstitution()).not.toThrow();
  });

  it("does not pretend every core experience is automatically measurable", () => {
    expect(experienceInvariants.find((item) => item.id === "EX-05")?.verification).toEqual(["manual_required"]);
    expect(experienceInvariants.some((item) => item.verification.includes("automated_hard"))).toBe(true);
    expect(experienceInvariants.some((item) => item.verification.includes("manual_required"))).toBe(true);
  });

  it("injects ordinary experience constraints and a plain safety override", () => {
    const ordinary = renderExperiencePromptContract();
    expect(ordinary).toContain(EXPERIENCE_CONSTITUTION_VERSION);
    expect(ordinary).toContain("EX-01");
    expect(ordinary).toContain("EX-10");
    const safety = renderSafetyExperienceContract();
    expect(safety).toContain("safety_plain");
    expect(safety).toContain("停止普通行动、切换、回访与角色沉浸");
  });
});
