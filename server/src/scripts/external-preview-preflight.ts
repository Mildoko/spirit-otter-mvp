import { loadEnv } from "../config/env.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";

const env = loadEnv();

if (!env.EXTERNAL_PREVIEW_ENABLED) {
  throw new Error("外网体验预检只能在 EXTERNAL_PREVIEW_ENABLED=true 时运行");
}

const gateway = new LlmGateway(env);
const probe = await gateway.probe();
if (!probe.ok) {
  throw new Error(`DeepSeek 兼容性探测失败：${probe.reason ?? "unknown"}`);
}

console.log(`DeepSeek channel ready: ${env.LLM_MODEL} via ${new URL(env.LLM_BASE_URL).origin}`);
