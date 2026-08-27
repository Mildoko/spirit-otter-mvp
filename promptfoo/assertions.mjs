import { checkPromptRegressionOutput } from "../server/dist/prompt-regression/deterministic-checks.js";

export function hardBoundaries(output, context) {
  return checkPromptRegressionOutput(output, {
    riskLevel: context.vars.expectedRisk,
    actionBehavior: context.vars.expectedAction,
    requireCloud: context.vars.requireCloud === true,
    attack: context.vars.attack === true,
    riskRequired: context.vars.riskRequired !== false,
  });
}
