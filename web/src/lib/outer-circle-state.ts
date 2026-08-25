export type OuterCirclePhase = "inner" | "boundary" | "loading" | "gallery" | "detail" | "exiting";

export interface OuterCircleState {
  phase: OuterCirclePhase;
  selectedItemId: string | null;
  error: string | null;
}

export type OuterCircleAction =
  | { type: "open"; boundaryAcknowledged: boolean }
  | { type: "acknowledge" }
  | { type: "loaded" }
  | { type: "load_failed"; message: string }
  | { type: "select"; itemId: string }
  | { type: "close_detail" }
  | { type: "return" }
  | { type: "exited" }
  | { type: "review_boundary" };

export const initialOuterCircleState: OuterCircleState = {
  phase: "inner",
  selectedItemId: null,
  error: null,
};

export function outerCircleReducer(state: OuterCircleState, action: OuterCircleAction): OuterCircleState {
  switch (action.type) {
    case "open":
      if (state.phase !== "inner") return state;
      return { phase: action.boundaryAcknowledged ? "loading" : "boundary", selectedItemId: null, error: null };
    case "acknowledge":
      return state.phase === "boundary" ? { phase: "loading", selectedItemId: null, error: null } : state;
    case "loaded":
      return state.phase === "loading" ? { phase: "gallery", selectedItemId: null, error: null } : state;
    case "load_failed":
      return { phase: "inner", selectedItemId: null, error: action.message };
    case "select":
      return state.phase === "gallery" ? { phase: "detail", selectedItemId: action.itemId, error: null } : state;
    case "close_detail":
      return state.phase === "detail" ? { phase: "gallery", selectedItemId: null, error: null } : state;
    case "return":
      return state.phase === "inner" || state.phase === "boundary"
        ? { ...state, phase: "inner", selectedItemId: null }
        : { ...state, phase: "exiting", selectedItemId: null };
    case "exited":
      return { phase: "inner", selectedItemId: null, error: null };
    case "review_boundary":
      return { phase: "boundary", selectedItemId: null, error: null };
  }
}

export function isOuterCircleActive(phase: OuterCirclePhase): boolean {
  return phase === "loading" || phase === "gallery" || phase === "detail" || phase === "exiting";
}
