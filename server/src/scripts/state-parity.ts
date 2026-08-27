import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getShortestPaths } from "xstate/graph";
import type { ActionStatus, RawSignals, ResponsePlan } from "@otter/shared";
import { createDefaultGuidanceState, type AdvanceGuidanceStateInput } from "../modules/support/guidance-state.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";
import { createActionMachine, type ActionMachineEvent } from "../state-machines/action-machine.js";
import { resolveActionTransition } from "../state-machines/action-transition.js";
import { createFollowupMachine, type FollowupMachineEvent, type FollowupStatus } from "../state-machines/followup-machine.js";
import { resolveFollowupTransition } from "../state-machines/followup-transition.js";
import { resolveGuidanceTransition } from "../state-machines/guidance-transition.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const actionStatuses: ActionStatus[] = ["draft", "confirmed", "completed", "deferred", "deleted"];
const actionEvents: ActionMachineEvent[] = [{ type: "CONFIRM" }, { type: "ABANDON" }, { type: "COMPLETE" }, { type: "DEFER" }, { type: "DELETE" }];
const actionComparisons = actionStatuses.flatMap((status) => actionEvents.map((event) => resolveActionTransition({ mode: "shadow", status, event })));
const followupStatuses: FollowupStatus[] = ["pending", "completed", "deferred", "closed", "deleted"];
const followupEvents: FollowupMachineEvent[] = [{ type: "COMPLETE" }, { type: "DEFER" }, { type: "CLOSE" }, { type: "DELETE" }, { type: "LABEL_OUTCOME", state: "completed" }, { type: "LABEL_OUTCOME", state: "blocked" }];
const followupComparisons = followupStatuses.flatMap((status) => followupEvents.map((event) => resolveFollowupTransition({ mode: "shadow", status, outcomeState: "not_started", outcomeLabeled: false, event })));
const signals: RawSignals = { sentimentPolarity: 0, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.2, taskPressureScore: 0.2, supportSeekingScore: 0.4, expressionClarityScore: 0.6, progressReadinessScore: 0.4, evidenceSpans: [], confidence: 0.7, modelRiskHint: "low", ruleCodes: ["SYNTHETIC"] };
const plan: ResponsePlan = { activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "quiet_water", primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0, allowedContent: [], forbiddenContent: [] };
let guidanceState = createDefaultGuidanceState();
let guidanceMismatch = 0;
for (let index = 0; index < 200; index += 1) {
  const transition: AdvanceGuidanceStateInput = {
    previous: guidanceState,
    intent: { acceptedTransition: index % 17 === 0, declinedTransition: index % 19 === 0, requestNoQuestions: index % 23 === 0, allowQuestions: index % 29 === 0, directActionRequest: false, requestTopicLead: false, lowSignalTopicCue: false, requestTopicSwitch: false, requestTopicStop: index % 31 === 0 },
    signals: { ...signals, expressionClarityScore: index % 4 === 0 ? 0.2 : 0.6, progressReadinessScore: index % 5 === 0 ? 0.8 : 0.3 },
    plan: { ...plan, primaryStrategy: index % 7 === 0 ? "clarify_low_signal" : index % 11 === 0 ? "invite_one_small_action" : "specific_reflection" },
    deliveredAccent: index % 13 === 0 ? "metaphor" : "none",
    now: new Date(1_788_000_000_000 + index * 60_000),
    segmentIdFactory: () => `synthetic-segment-${index}`,
  };
  const compared = resolveGuidanceTransition({ mode: "shadow", transition });
  if (compared.parity === "mismatch") guidanceMismatch += 1;
  guidanceState = compared.state;
}
const domains = {
  guidance: { comparisons: 200, mismatches: guidanceMismatch },
  action: { comparisons: actionComparisons.length, mismatches: actionComparisons.filter((item) => item.parity === "mismatch").length, reachableStates: getShortestPaths(createActionMachine("draft")).length },
  followup: { comparisons: followupComparisons.length, mismatches: followupComparisons.filter((item) => item.parity === "mismatch").length, reachableStates: getShortestPaths(createFollowupMachine("pending")).length },
};
const report = { schemaVersion: "state-parity-v1", provenance: resolveEvidenceProvenance(workspaceRoot), status: Object.values(domains).every((domain) => domain.mismatches === 0) ? "passed" : "failed", syntheticOnly: true, domains };
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "state-parity.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`STATE_PARITY ${report.status} comparisons=${Object.values(domains).reduce((sum, domain) => sum + domain.comparisons, 0)}\n`);
if (report.status !== "passed") process.exitCode = 1;
