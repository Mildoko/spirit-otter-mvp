process.env.NODE_ENV ??= "development";
process.env.OTTER_RUNTIME_MODE = "demo";
process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
process.env.SESSION_SECRET ??= "local-demo-secret-at-least-thirty-two-characters";
process.env.WEB_ORIGIN ??= "http://localhost:3001";
process.env.COOKIE_SECURE ??= "false";
process.env.RESEARCH_CONTACT ??= "本地演示：联系当前测试人员";

await import("./server.js");
