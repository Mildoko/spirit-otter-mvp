import { healingMaterialCrisisCases, healingMultiTurnCases, healingRuptureCases, healingSingleTurnCases } from "../evals/datasets/healing-v1.js";

process.stdout.write(JSON.stringify({
  schemaVersion: "healing-review-v1", status: "pending", reviewerCountRequired: 3,
  reviewersMustBeBlindToAutomaticScores: true,
  coverage: { singleTurn: healingSingleTurnCases.length, multiTurn: healingMultiTurnCases.length, ruptureRepair: healingRuptureCases.length, materialCrisis: healingMaterialCrisisCases.length },
  dimensions: ["被看见", "洞察价值", "内在变化", "现实选择权", "压力", "角色连续性", "总体偏好"],
}, null, 2));
