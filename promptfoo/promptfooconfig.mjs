import { coreDialogueSingleTurnSamples } from "../server/dist/evals/datasets/core-dialogue-single-turn.js";
import { adversarialCases } from "../server/dist/evals/datasets/safety-cases.js";
import { characterFrozenSamples, experienceFrozenDatasetVersions, expressionV2FrozenCases, lowSignalFrozenSamples } from "../server/dist/evals/datasets/experience-frozen.js";
import { runHardRiskGuard } from "../server/dist/modules/support/risk-guard.js";

const requireCloud = process.env.PROMPTFOO_OFFLINE === "false";
const assertions = [{ type: "is-json" }, { type: "javascript", value: "file://assertions.mjs:hardBoundaries" }];
const attackEx = ["EX-10", "EX-10", "EX-12", "EX-08", "EX-12", "EX-03", "EX-09", "EX-12", "EX-10", "EX-10", "EX-10", "EX-09", "EX-09", "EX-09", "EX-01", "EX-01", "EX-01", "EX-01", "EX-01", "EX-01"];
const coreEx = { companion_only: "EX-02", companion_to_transition: "EX-07", direct_organize: "EX-08", followup: "EX-11", high_risk: "EX-01" };
const genericFrozenCase = ({ sampleId, text, dataset, invariant, currentSpirit, spiritTurnCount, expectedAction }) => ({
  description: sampleId,
  vars: {
    sampleId, text, expectedRisk: "low", requireCloud,
    riskRequired: requireCloud || runHardRiskGuard(text).level === "low",
    ...(currentSpirit ? { currentSpirit } : {}),
    ...(spiritTurnCount ? { spiritTurnCount } : {}),
    ...(expectedAction ? { expectedAction } : {}),
  },
  metadata: { dataset, frozen: true, invariant, riskCoverage: "checked" },
  assert: assertions,
});

export default {
  description: "Otter P1 frozen core and red-team regression",
  sharing: false,
  prompts: ["{{text}}"],
  providers: [{ id: "file://provider.mjs", label: "existing-orchestrator" }],
  tests: [
    ...coreDialogueSingleTurnSamples.map((sample) => ({
      description: sample.sampleId,
      vars: {
        sampleId: sample.sampleId,
        text: sample.input,
        expectedRisk: sample.expected.riskLevel,
        expectedAction: sample.expected.actionBehavior,
        requireCloud,
        riskRequired: requireCloud || runHardRiskGuard(sample.input).level === sample.expected.riskLevel,
        ...(sample.initialState.currentSpirit ? { currentSpirit: sample.initialState.currentSpirit } : {}),
        ...(sample.initialState.spiritTurnCount ? { spiritTurnCount: sample.initialState.spiritTurnCount } : {}),
        ...(sample.initialState.actionContext ? { actionContext: sample.initialState.actionContext } : {}),
      },
      metadata: { dataset: "core-dialogue-v1", frozen: true, invariant: coreEx[sample.taskType], riskCoverage: requireCloud || runHardRiskGuard(sample.input).level === sample.expected.riskLevel ? "checked" : "pending_model" },
      assert: assertions,
    })),
    ...adversarialCases.map((sample, index) => ({
      description: `RED-${sample.id}`,
      vars: { sampleId: `RED-${sample.id}`, text: sample.text, expectedRisk: sample.expected, attack: true, requireCloud, riskRequired: requireCloud || runHardRiskGuard(sample.text).level === sample.expected },
      metadata: { dataset: "safety-adversarial-v1", frozen: true, invariant: attackEx[index] || "EX-12", riskCoverage: requireCloud || runHardRiskGuard(sample.text).level === sample.expected ? "checked" : "pending_model" },
      assert: assertions,
    })),
    ...lowSignalFrozenSamples.map((text, index) => genericFrozenCase({
      sampleId: `LS-${String(index + 1).padStart(3, "0")}`, text,
      dataset: experienceFrozenDatasetVersions.lowSignal, invariant: index === 26 ? "EX-02" : index === 27 ? "EX-03" : "EX-04",
    })),
    ...expressionV2FrozenCases.map((sample, index) => genericFrozenCase({
      sampleId: `EXP-${String(index + 1).padStart(3, "0")}`, text: sample.text,
      dataset: experienceFrozenDatasetVersions.expression, invariant: "EX-06", currentSpirit: sample.plan.activeSpirit,
    })),
    ...Object.entries(characterFrozenSamples).flatMap(([group, samples]) => samples.map((text, index) => genericFrozenCase({
      sampleId: `CHAR-${group.toUpperCase()}-${String(index + 1).padStart(3, "0")}`, text,
      dataset: experienceFrozenDatasetVersions.character,
      invariant: group === "boundary" ? "EX-07" : group === "shore" ? "EX-08" : "EX-06",
      currentSpirit: group === "shore" || group === "boundary" ? "shore_pick" : "deep_tide",
      spiritTurnCount: group === "blend" || group === "boundary" ? 2 : 1,
      expectedAction: group === "deep" || group === "boundary" ? "no_ordinary_action" : group === "blend" ? "no_action_before_acceptance" : undefined,
    }))),
  ],
};
