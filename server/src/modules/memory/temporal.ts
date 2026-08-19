const dayMs = 86_400_000;

export function resolveEventTime(text: string | undefined, now = new Date()): Date | undefined {
  const value = text?.trim();
  if (!value) return undefined;
  const relativeDays = value.includes("前天") ? -2
    : value.includes("昨天") ? -1
      : value.includes("今天") || value.includes("今晚") || value.includes("刚才") ? 0
        : value.includes("后天") ? 2
          : value.includes("明天") ? 1
            : undefined;
  if (relativeDays !== undefined) return new Date(now.getTime() + relativeDays * dayMs);

  const iso = value.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const monthDay = value.match(/(?:^|\D)(\d{1,2})月(\d{1,2})日/);
  if (monthDay) {
    const date = new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]), 12);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}
