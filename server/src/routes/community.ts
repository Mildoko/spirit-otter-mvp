import type { FastifyInstance } from "fastify";
import type { PublicPortalFeedV01, PublicPortalItemV01 } from "@otter/shared";
import { getPublicPortalFeedV01, getPublicPortalItemV01 } from "../modules/community/public-catalog.js";

const noQuerySchema = {
  type: "object",
  additionalProperties: false,
  maxProperties: 0,
} as const;

export function registerCommunityRoutes(app: FastifyInstance): void {
  app.get<{ Reply: PublicPortalFeedV01 }>("/api/community/v0.1/public-feed", {
    schema: { querystring: noQuerySchema },
  }, async () => getPublicPortalFeedV01());

  app.get<{ Params: { id: string }; Reply: PublicPortalItemV01 }>("/api/community/v0.1/public-items/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1, maxLength: 80, pattern: "^[a-z0-9-]+$" } },
      },
      querystring: noQuerySchema,
    },
  }, async (request, reply) => {
    const item = getPublicPortalItemV01(request.params.id);
    if (!item) return reply.code(404).send({
      error: { code: "PUBLIC_ITEM_NOT_FOUND", message: "这项公开内容暂时找不到" },
    } as never);
    return item;
  });
}
