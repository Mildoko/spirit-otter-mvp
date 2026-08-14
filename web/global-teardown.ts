async function globalTeardown(): Promise<void> {
  if (process.env.E2E_MODE !== "demo") return;
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
  await fetch(`${baseURL}/api/demo/shutdown`, { method: "POST" }).catch(() => undefined);
}

export default globalTeardown;
