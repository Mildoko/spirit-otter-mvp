import { describe, expect, it } from "vitest";
import { initialOuterCircleState, isOuterCircleActive, outerCircleReducer } from "./outer-circle-state";

describe("outer circle v0.1 state machine", () => {
  it("requires the boundary on first entry and enters only after acknowledgement", () => {
    const boundary = outerCircleReducer(initialOuterCircleState, { type: "open", boundaryAcknowledged: false });
    expect(boundary.phase).toBe("boundary");
    const loading = outerCircleReducer(boundary, { type: "acknowledge" });
    expect(loading.phase).toBe("loading");
    expect(outerCircleReducer(loading, { type: "loaded" }).phase).toBe("gallery");
  });

  it("lets a returning browser enter directly, open one detail, and always exit", () => {
    const loading = outerCircleReducer(initialOuterCircleState, { type: "open", boundaryAcknowledged: true });
    const gallery = outerCircleReducer(loading, { type: "loaded" });
    const detail = outerCircleReducer(gallery, { type: "select", itemId: "night-lantern-walk" });
    expect(detail).toMatchObject({ phase: "detail", selectedItemId: "night-lantern-walk" });
    expect(outerCircleReducer(detail, { type: "close_detail" }).phase).toBe("gallery");
    const exiting = outerCircleReducer(detail, { type: "return" });
    expect(isOuterCircleActive(exiting.phase)).toBe(true);
    expect(outerCircleReducer(exiting, { type: "exited" })).toEqual(initialOuterCircleState);
  });

  it("returns to the private inner circle when the public feed fails", () => {
    const loading = outerCircleReducer(initialOuterCircleState, { type: "open", boundaryAcknowledged: true });
    expect(outerCircleReducer(loading, { type: "load_failed", message: "暂时无法进入外圈" })).toEqual({
      phase: "inner",
      selectedItemId: null,
      error: "暂时无法进入外圈",
    });
  });
});
