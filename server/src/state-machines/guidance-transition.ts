import type { GuidanceStateV4 } from "@otter/shared";
import type { AiTelemetry } from "../observability/ai-telemetry.js";
import { advanceGuidanceState, type AdvanceGuidanceStateInput } from "../modules/support/guidance-state.js";
import { advanceGuidanceStateXState } from "./guidance-machine.js";

export function resolveGuidanceTransition(input: {
  mode: "legacy" | "shadow" | "new";
  transition: AdvanceGuidanceStateInput;
  telemetry?: AiTelemetry;
}): { state: GuidanceStateV4; parity: "not_checked" | "match" | "mismatch" } {
  const legacy = advanceGuidanceState(input.transition);
  if (input.mode === "legacy") return { state: legacy, parity: "not_checked" };
  const candidate = advanceGuidanceStateXState(input.transition);
  const parity = JSON.stringify(candidate) === JSON.stringify(legacy) ? "match" : "mismatch";
  input.telemetry?.recordStateParity({ domain: "guidance", engine: input.mode, outcome: parity });
  return { state: input.mode === "new" ? candidate : legacy, parity };
}
