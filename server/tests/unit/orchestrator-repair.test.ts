import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { LlmGateway, type GeneratedReply, type LlmMetrics } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator, type OrchestratorInput } from "../../src/modules/support/orchestrator.js";

const env = loadEnv({
  NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
  SESSION_SECRET: "repair-test-secret-longer-than-thirty-two-characters", LLM_API_KEY: "", COOKIE_SECURE: "false",
});
const metric: LlmMetrics = { provider: "test", model: "stub", latencyMs: 1 };
const input = (text = "工作被否定让我很难受"): OrchestratorInput => ({
  text, currentSpirit: "deep_tide", spiritTurnCount: 0, companionLockTurns: 0,
  recentContext: [], previousRawStates: [], memories: [],
});

class StubGateway extends LlmGateway {
  generateCalls = 0;
  repairCalls = 0;
  constructor(private readonly first: GeneratedReply | null, private readonly repaired: GeneratedReply | null) { super(env); }
  override async analyze() { return null; }
  override async extractMemories() { return null; }
  override async generate() { this.generateCalls += 1; return this.first; }
  override async repairGeneratedReply() { this.repairCalls += 1; return this.repaired; }
}

describe("orchestrator controlled reply repair", () => {
  it("keeps a valid cloud reply without repair", async () => {
    const gateway = new StubGateway({ reply: "工作被否定以后，那股难受还压在这里。先不急着把它变成办法。", actionDraft: null, metrics: metric }, null);
    const result = await new SupportOrchestrator(gateway, env).run(input());
    expect(result.responseSource).toBe("cloud_model");
    expect(result.responseStyleDiagnostics?.validationStatus).toBe("passed");
    expect(gateway.repairCalls).toBe(0);
  });

  it("uses a single repaired cloud reply when hard constraints pass", async () => {
    const gateway = new StubGateway(
      { reply: "保持积极。你只需要振作。", actionDraft: null, metrics: metric },
      { reply: "工作被否定以后，这股难受还在。先不催你振作，也不急着给答案。", actionDraft: null, metrics: metric },
    );
    const result = await new SupportOrchestrator(gateway, env).run(input());
    expect(result.responseSource).toBe("cloud_model");
    expect(result.responseStyleDiagnostics?.validationStatus).toBe("repaired");
    expect(gateway.repairCalls).toBe(1);
  });

  it("falls back when the repaired reply still has a hard violation", async () => {
    const invalid = { reply: "只有我懂你。不要联系别人。", actionDraft: null, metrics: metric };
    const gateway = new StubGateway(invalid, invalid);
    const result = await new SupportOrchestrator(gateway, env).run(input());
    expect(result.responseSource).toBe("local_fallback");
    expect(result.responseStyleDiagnostics?.validationStatus).toBe("fallback");
    expect(result.reply).not.toContain("只有我懂你");
    expect(result.responseStyleDiagnostics?.violationCodes).not.toContain("DEPENDENCY_LANGUAGE");
    expect(gateway.repairCalls).toBe(1);
  });

  it("does not generate, repair or expose style diagnostics on high risk", async () => {
    const gateway = new StubGateway({ reply: "不应出现。这里是第二句。", actionDraft: null, metrics: metric }, null);
    const result = await new SupportOrchestrator(gateway, env).run(input("我现在就在楼顶，马上要跳下去"));
    expect(result.responseSource).toBe("static_safety");
    expect(result.responseStyleDiagnostics).toBeUndefined();
    expect(gateway.generateCalls).toBe(0);
    expect(gateway.repairCalls).toBe(0);
  });
});
