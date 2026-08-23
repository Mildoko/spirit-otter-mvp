import { describe, expect, it } from "vitest";
import { resolveCurrentDateReply } from "../../src/modules/support/runtime-facts.js";

describe("runtime facts", () => {
  it("uses Asia/Shanghai across the UTC date boundary", () => {
    expect(resolveCurrentDateReply("今天几号？", new Date("2026-08-23T16:30:00.000Z"), "Asia/Shanghai"))
      .toBe("今天是2026年8月24日，星期一。");
  });

  it("does not intercept ordinary uses of today", () => {
    expect(resolveCurrentDateReply("我今天很累。", new Date("2026-08-23T06:30:00.000Z"), "Asia/Shanghai")).toBeNull();
  });
});
