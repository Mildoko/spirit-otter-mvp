import { z } from "zod";
import { coreSoulCard, spiritCards } from "./cards.js";

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
  characterCardSchema.parse(coreSoulCard);
  characterCardSchema.parse(spiritCards.deep_tide);
  characterCardSchema.parse(spiritCards.shore_pick);
}
