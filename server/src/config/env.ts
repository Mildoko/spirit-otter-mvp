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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  LLM_PROVIDER: z.string().default("deepseek"),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("deepseek-v4-flash"),
  LLM_JSON_MODE: booleanFromString,
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
  return result.data;
}
