import { z } from "zod";
import { coreSoulCard, spiritCards } from "./cards.js";
import { RESPONSE_STYLE_VERSION, responseStyleProfileSchema, spiritStyleDefaults } from "./response-style.js";
import { validatePublicAgentRegistry } from "./public-agent-registry.js";

export const activeSpiritSchema = z.enum(["deep_tide", "shore_pick"]);
export const transitionStyleSchema = z.enum(["steady", "blend_to_deep", "blend_to_shore"]);

const characterCardSchema = z.object({
  id: z.enum(["core_soul", "deep_tide", "shore_pick"]),
  version: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  beliefs: z.array(z.string().min(1)).min(1),
  voice: z.array(z.string().min(1)).min(1),
  responseContract: z.array(z.string().min(1)).min(1),
  forbidden: z.array(z.string().min(1)).min(1),
  examples: z.array(z.object({ user: z.string().min(1), assistant: z.string().min(1) })),
});

export function validateCharacterRegistry(): void {
  validatePublicAgentRegistry();
  characterCardSchema.parse(coreSoulCard);
  characterCardSchema.parse(spiritCards.deep_tide);
  characterCardSchema.parse(spiritCards.shore_pick);
  z.string().min(1).parse(RESPONSE_STYLE_VERSION);
  for (const profile of Object.values(spiritStyleDefaults)) responseStyleProfileSchema.parse(profile);
}
