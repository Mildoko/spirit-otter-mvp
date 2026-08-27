import type { AppEnv } from "../config/env.js";
import { AI_TRACE_ATTRIBUTE_KEYS } from "./ai-telemetry.js";

const forbiddenAttributePattern = /prompt|completion|user|session|conversation|memory|message|content|email|phone/i;

export interface AiTelemetryPrivacyAuditV1 {
  schemaVersion: "ai-telemetry-privacy-audit-v1";
  generatedAt: string;
  status: "passed" | "failed";
  readiness: "enabled" | "configuration_pending" | "disabled_by_config";
  captureMode: "metadata_only";
  exporterUsesHttps: boolean;
  credentials: {
    publicKeyPresent: boolean;
    secretKeyPresent: boolean;
  };
  allowedAttributeKeys: readonly string[];
  forbiddenAttributeKeys: string[];
  notes: string[];
}

export function auditAiTelemetryPrivacy(env: AppEnv, now = new Date()): AiTelemetryPrivacyAuditV1 {
  const publicKeyPresent = env.LANGFUSE_PUBLIC_KEY.trim().length > 0;
  const secretKeyPresent = env.LANGFUSE_SECRET_KEY.trim().length > 0;
  const forbiddenAttributeKeys = AI_TRACE_ATTRIBUTE_KEYS.filter((key) => forbiddenAttributePattern.test(key));
  const exporterUsesHttps = new URL(env.LANGFUSE_BASE_URL).protocol === "https:";
  const status = forbiddenAttributeKeys.length === 0 && exporterUsesHttps ? "passed" : "failed";
  let readiness: AiTelemetryPrivacyAuditV1["readiness"] = "configuration_pending";
  if (env.AI_OBSERVABILITY_ENABLED) readiness = "enabled";
  else if (publicKeyPresent && secretKeyPresent) readiness = "disabled_by_config";

  return {
    schemaVersion: "ai-telemetry-privacy-audit-v1",
    generatedAt: now.toISOString(),
    status,
    readiness,
    captureMode: "metadata_only",
    exporterUsesHttps,
    credentials: { publicKeyPresent, secretKeyPresent },
    allowedAttributeKeys: AI_TRACE_ATTRIBUTE_KEYS,
    forbiddenAttributeKeys,
    notes: [
      "报告只记录凭据是否存在，不输出凭据内容。",
      "未启用导出不等于隐私合同失败；readiness 会保持 configuration_pending 或 disabled_by_config。",
      "Prompt、回复、用户/会话/对话标识和记忆内容不在允许属性列表中。",
    ],
  };
}
