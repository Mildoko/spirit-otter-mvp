import { describe, expect, it } from "vitest";
import { INVITE_CODE_DAYS } from "../../src/config/constants.js";
import { addDays } from "../../src/utils.js";

describe("invite code expiry policy", () => {
  it("expires newly generated invite codes after seven days", () => {
    const issuedAt = new Date("2026-08-21T00:00:00.000Z");
    expect(INVITE_CODE_DAYS).toBe(7);
    expect(addDays(issuedAt, INVITE_CODE_DAYS).toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });
});
