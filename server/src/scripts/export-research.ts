import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db/client.js";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

try {
  const events = await prisma.behaviorEvent.findMany({
    include: { user: { select: { researchId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const header = ["research_id", "event_type", "duration_ms", "created_at", "metadata_json"];
  const lines = [header.map(csvCell).join(",")];
  for (const event of events) {
    lines.push([
      event.user.researchId,
      event.eventType,
      event.durationMs,
      event.createdAt.toISOString(),
      event.metadataJson ? JSON.stringify(event.metadataJson) : "",
    ].map(csvCell).join(","));
  }
  const outputDir = join(process.cwd(), "research-export");
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, `behavior-${new Date().toISOString().replaceAll(":", "-")}.csv`);
  await writeFile(output, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`已导出 ${events.length} 条匿名行为记录：${output}\n`);
} finally {
  await prisma.$disconnect();
}
