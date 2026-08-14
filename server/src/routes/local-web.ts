import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/dist");
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp",
};

export function registerLocalWebRoutes(app: FastifyInstance): void {
  app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await readFile(join(webDist, "index.html"))));
  app.get("/assets/*", async (request, reply) => {
    const name = z.string().regex(/^[A-Za-z0-9._-]+$/).parse((request.params as { "*": string })["*"]);
    return reply.type(contentTypes[extname(name)] ?? "application/octet-stream").send(await readFile(join(webDist, "assets", name)));
  });
  app.get("/favicon.ico", async (_request, reply) => reply.code(204).send());
}
