import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function hashSecret(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomResearchId(): string {
  return `OT-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
