import { describe, expect, it } from "vitest";
import { mapTataExpression } from "./otter-expression";

const interpretation = (label: "joy" | "sadness" | "anger") => ({
  status: "inferred" as const,
  labels: [{ label, displayName: label, intensityLevel: 3 as const }],
  disclaimer: "test",
  canCorrect: true,
});

describe("tata emotion expression", () => {
  it("maps emotion to an empathic stance instead of mirroring anger", () => {
    expect(mapTataExpression(interpretation("joy"), "underwater_companion").expression).toBe("warm");
    expect(mapTataExpression(interpretation("sadness"), "underwater_companion").expression).toBe("concerned");
    expect(mapTataExpression(interpretation("anger"), "underwater_companion").expression).toBe("steady");
  });

  it("prioritizes uncertainty and safety", () => {
    expect(mapTataExpression({ status: "unknown", labels: [], disclaimer: "test", canCorrect: true }, "underwater_companion").expression).toBe("uncertain");
    expect(mapTataExpression(interpretation("joy"), "safety_plain").expression).toBe("protective");
  });
});
