import type { ResponsePlan, RiskLevel, TopicSkillGuidanceStateV1, TopicSkillId } from "@otter/shared";
import { astrologySkill } from "./astrology/skill.js";
import { inactiveSkill, type SkillResolution, type TopicSkillDefinition } from "./types.js";

const registry = new Map<TopicSkillId, TopicSkillDefinition>([[astrologySkill.id, astrologySkill]]);

export function getTopicSkill(id: TopicSkillId): TopicSkillDefinition {
  const skill = registry.get(id);
  if (!skill) throw new Error(`未知 Topic Skill：${id}`);
  return skill;
}

export function resolveTopicSkill(input: {
  text: string;
  recentContext: string[];
  riskLevel: RiskLevel;
  plan: ResponsePlan;
  state: TopicSkillGuidanceStateV1;
  astrologyEnabled: boolean;
}): SkillResolution {
  if (input.riskLevel === "high" || input.riskLevel === "imminent") return inactiveSkill("SAFETY_PLAIN_PREEMPTS_ALL_SKILLS");
  return astrologySkill.resolve({ ...input, enabled: input.astrologyEnabled });
}
