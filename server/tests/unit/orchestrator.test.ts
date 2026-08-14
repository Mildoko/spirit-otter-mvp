import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { LlmGateway } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../../src/modules/support/orchestrator.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
  SESSION_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
  LLM_API_KEY: "",
  COOKIE_SECURE: "false",
});
const orchestrator = new SupportOrchestrator(new LlmGateway(env), env);

describe("support orchestrator without cloud credentials", () => {
  it("returns direct static safety support without an action", async () => {
    const result = await orchestrator.run({ text: "我现在想自杀，已经决定了。", intent: "organize", currentMode: "companion", transitionAccepted: true, recentContext: [] });
    expect(result.plan.sceneState).toBe("safety_plain");
    expect(result.actionDraft).toBeNull();
    expect(result.metrics).toEqual([]);
    expect(result.reply).toContain("现实");
    expect(result.reply).not.toContain("水面");
  });

  it("creates at most one local fallback action in organize mode", async () => {
    const result = await orchestrator.run({ text: "项目太乱了，我不知道先做什么", intent: "organize", currentMode: "companion", transitionAccepted: true, recentContext: [] });
    expect(result.plan.allowActionDraft).toBe(true);
    expect(result.actionDraft).toBeTypeOf("string");
  });
});
