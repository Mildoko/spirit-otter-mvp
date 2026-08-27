import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { auditAiTelemetryPrivacy } from "../../src/observability/ai-telemetry-privacy-audit.js";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused/unused",
  SESSION_SECRET: "privacy-audit-test-secret-with-thirty-two-characters",
  LLM_API_KEY: "",
};

describe("AI telemetry privacy audit", () => {
  it("passes the metadata-only contract while credentials are pending", () => {
    const report = auditAiTelemetryPrivacy(loadEnv(base));
    expect(report.status).toBe("passed");
    expect(report.readiness).toBe("configuration_pending");
    expect(report.forbiddenAttributeKeys).toEqual([]);
    expect(report.credentials).toEqual({ publicKeyPresent: false, secretKeyPresent: false });
  });

  it("reports enabled without exposing credential values", () => {
    const report = auditAiTelemetryPrivacy(loadEnv({
      ...base,
      AI_OBSERVABILITY_ENABLED: "true",
      LANGFUSE_PUBLIC_KEY: "public-test-value",
      LANGFUSE_SECRET_KEY: "secret-test-value",
      LANGFUSE_BASE_URL: "https://langfuse.example.com",
    }));
    expect(report.readiness).toBe("enabled");
    expect(JSON.stringify(report)).not.toContain("public-test-value");
    expect(JSON.stringify(report)).not.toContain("secret-test-value");
  });
});
