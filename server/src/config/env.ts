import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: resolve(workspaceRoot, ".env.local"), quiet: true });
loadDotenv({ path: resolve(workspaceRoot, ".env"), quiet: true });

const booleanFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const booleanFromStringDefaultFalse = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const migrationMode = z.enum(["legacy", "shadow", "new"]).default("legacy");
const p2CapabilityMode = z.enum(["off", "shadow", "on"]).default("off");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  LLM_PROVIDER: z.string().default("deepseek"),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("deepseek-v4-flash"),
  LLM_JSON_MODE: booleanFromString,
  LLM_STRUCTURED_OUTPUT_MODE: migrationMode,
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("https://otter.local"),
  COOKIE_SECURE: booleanFromString,
  RESEARCH_CONTACT: z.string().default("请联系现场研究人员"),
  LOCAL_TEST_MODE: booleanFromStringDefaultFalse,
  OTTER_RUNTIME_MODE: z.enum(["full", "demo", "lab"]).default("full"),
  EXPRESSION_STYLE_V2: booleanFromStringDefaultFalse,
  EMOTION_INFERENCE_V2: booleanFromStringDefaultFalse,
  SCENE_WORLD_V1: booleanFromStringDefaultFalse,
  AUDIO_V1: booleanFromStringDefaultFalse,
  MEMORY_V2: booleanFromStringDefaultFalse,
  ASTROLOGY_SKILL_V1: booleanFromStringDefaultFalse,
  EXTERNAL_PREVIEW_ENABLED: booleanFromStringDefaultFalse,
  EXTERNAL_PREVIEW_CODE: z.string().max(64).default(""),
  EXTERNAL_PREVIEW_MAX_SESSIONS: z.coerce.number().int().min(1).max(100).default(20),
  AI_OBSERVABILITY_ENABLED: booleanFromStringDefaultFalse,
  GUIDANCE_ENGINE_MODE: migrationMode,
  ACTION_ENGINE_MODE: migrationMode,
  FOLLOWUP_ENGINE_MODE: migrationMode,
  AGENT_HANDOFF_MODE: p2CapabilityMode,
  INTEREST_PROFILE_MODE: p2CapabilityMode,
  ACTIVITY_CATALOG_MODE: p2CapabilityMode,
  RECOMMENDATION_MODE: p2CapabilityMode,
  LANGFUSE_PUBLIC_KEY: z.string().default(""),
  LANGFUSE_SECRET_KEY: z.string().default(""),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
  APP_TIME_ZONE: z.string().min(1).default("Asia/Shanghai"),
  AZURE_SPEECH_KEY: z.string().default(""),
  AZURE_SPEECH_REGION: z.string().default(""),
  AZURE_SPEECH_VOICE: z.string().default("zh-CN-YunjianNeural"),
  AZURE_SPEECH_VOICE_LUCHAN: z.string().default(""),
  AZURE_SPEECH_VOICE_TATA: z.string().default("zh-CN-XiaoxiaoNeural"),
  AZURE_SPEECH_VOICE_FEIER: z.string().default("zh-CN-XiaoyiNeural"),
  BUILD_VERSION: z.string().min(1).default("auto"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const normalized = { ...source };
  if (!normalized.OTTER_RUNTIME_MODE && normalized.LOCAL_TEST_MODE === "true") {
    normalized.OTTER_RUNTIME_MODE = "lab";
  }
  if (normalized.EXPRESSION_STYLE_V2 === undefined) {
    normalized.EXPRESSION_STYLE_V2 = normalized.OTTER_RUNTIME_MODE === "full" || normalized.OTTER_RUNTIME_MODE === undefined ? "false" : "true";
  }
  if (normalized.EMOTION_INFERENCE_V2 === undefined) {
    normalized.EMOTION_INFERENCE_V2 = normalized.OTTER_RUNTIME_MODE === "full" || normalized.OTTER_RUNTIME_MODE === undefined ? "false" : "true";
  }
  if (normalized.SCENE_WORLD_V1 === undefined) {
    normalized.SCENE_WORLD_V1 = normalized.OTTER_RUNTIME_MODE === "full" || normalized.OTTER_RUNTIME_MODE === undefined ? "false" : "true";
  }
  if (normalized.AUDIO_V1 === undefined) {
    normalized.AUDIO_V1 = normalized.OTTER_RUNTIME_MODE === "demo" ? "true" : "false";
  }
  if (normalized.MEMORY_V2 === undefined) {
    normalized.MEMORY_V2 = normalized.OTTER_RUNTIME_MODE === "full" || normalized.OTTER_RUNTIME_MODE === undefined ? "false" : "true";
  }
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`环境配置无效：${details}`);
  }
  if (result.data.NODE_ENV === "production" && !result.data.LLM_API_KEY) {
    throw new Error("生产模式必须配置 LLM_API_KEY");
  }
  if (result.data.NODE_ENV === "production" && result.data.LOCAL_TEST_MODE) {
    throw new Error("生产模式禁止启用 LOCAL_TEST_MODE");
  }
  if (result.data.NODE_ENV === "production" && result.data.OTTER_RUNTIME_MODE !== "full") {
    throw new Error("生产模式只允许 full 运行模式");
  }
  if (result.data.NODE_ENV === "production" && /^(?:请联系)?现场研究人员$/u.test(result.data.RESEARCH_CONTACT.trim())) {
    throw new Error("生产模式必须配置可执行的 RESEARCH_CONTACT，不能使用占位联系人");
  }
  if (result.data.EXTERNAL_PREVIEW_ENABLED && result.data.OTTER_RUNTIME_MODE !== "demo") {
    throw new Error("外网受控体验只能在 demo 运行模式中启用");
  }
  if (result.data.EXTERNAL_PREVIEW_ENABLED && result.data.EXTERNAL_PREVIEW_CODE.trim().length < 10) {
    throw new Error("外网受控体验码至少需要 10 个字符");
  }
  if (result.data.EXTERNAL_PREVIEW_ENABLED) {
    if (!result.data.LLM_API_KEY.trim()) {
      throw new Error("外网受控体验必须配置 DeepSeek API 密钥，禁止以本地降级回复冒充真实模型");
    }
    if (result.data.LLM_PROVIDER.trim().toLowerCase() !== "deepseek") {
      throw new Error("外网受控体验当前只允许使用 DeepSeek 模型供应商");
    }
    const model = result.data.LLM_MODEL.trim().toLowerCase();
    if (model !== "deepseek-v4-flash" && model !== "deepseek-v4-pro") {
      throw new Error("外网受控体验只允许 deepseek-v4-flash 或 deepseek-v4-pro");
    }
    const endpoint = new URL(result.data.LLM_BASE_URL);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.deepseek.com") {
      throw new Error("外网受控体验必须使用 DeepSeek 官方 HTTPS API 地址 https://api.deepseek.com");
    }
  }
  if (result.data.AI_OBSERVABILITY_ENABLED && (!result.data.LANGFUSE_PUBLIC_KEY.trim() || !result.data.LANGFUSE_SECRET_KEY.trim())) {
    throw new Error("启用 AI 可观测性时必须同时配置 LANGFUSE_PUBLIC_KEY 和 LANGFUSE_SECRET_KEY");
  }
  if (result.data.AI_OBSERVABILITY_ENABLED && new URL(result.data.LANGFUSE_BASE_URL).protocol !== "https:") {
    throw new Error("AI 可观测性只允许通过 HTTPS 连接 Langfuse");
  }
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: result.data.APP_TIME_ZONE }).format(new Date());
  } catch {
    throw new Error("APP_TIME_ZONE 不是有效的 IANA 时区");
  }
  return result.data;
}
