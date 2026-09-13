import { describe, expect, it } from "vitest";
import { planFullRecut, type GroundTruthDoc, type LiveLoadState, type ShellLookup } from "../b5-full-recut-orchestration.js";

function load(overrides: Partial<LiveLoadState> = {}): LiveLoadState {
  return { load_id: "load-id", settlement_id: null, settlement_status: null, ...overrides };
}

function shellsFrom(map: Record<string, string | "MISSING" | "AMBIGUOUS">): ShellLookup {
  return {
    get(doc: string) {
      const v = map[doc];
      if (v === undefined || v === "MISSING") return { ok: false as const, reason: "no pre-seeded shell settlement found", candidate_ids: [] };
      if (v === "AMBIGUOUS") return { ok: false as const, reason: "more than one non-cancelled settlement already claims this ref", candidate_ids: ["x", "y"] };
      return { ok: true as const, settlement_id: v };
    },
  };
}

describe("planFullRecut", () => {
  it("moves every load into its document's pre-seeded shell settlement", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5773", loads: ["A", "B"] }];
    const liveLoads = new Map([
      ["A", load({ settlement_id: "OLD", settlement_status: "cancelled" })],
      ["B", load({ settlement_id: null })],
    ]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({ "5773": "SHELL-5773" }));
    expect(plan.actions).toEqual([
      { doc: "5773", target_settlement_id: "SHELL-5773", shell_error: null, moves: ["A", "B"], blocked_open_tour_loads: [] },
    ]);
  });

  it("is a no-op for a load already on its document's shell", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5775", loads: ["A"] }];
    const liveLoads = new Map([["A", load({ settlement_id: "SHELL-5775", settlement_status: "locked" })]]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({ "5775": "SHELL-5775" }));
    expect(plan.actions).toEqual([
      { doc: "5775", target_settlement_id: "SHELL-5775", shell_error: null, moves: [], blocked_open_tour_loads: [] },
    ]);
  });

  // SAFETY RULE (found in this session's own dry-run review, before any execution) -- an 'open'
  // settlement is a real, currently-progressing tour and must NEVER have a load pulled out of it
  // automatically, even to move it into its document's own correct shell.
  it("blocks (never auto-moves) a load that currently sits on a live open tour", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5797", loads: ["A", "B"] }];
    const liveLoads = new Map([
      ["A", load({ settlement_id: "OPEN-TOUR", settlement_status: "open" })],
      ["B", load({ settlement_id: "OTHER", settlement_status: "cancelled" })],
    ]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({ "5797": "SHELL-5797" }));
    expect(plan.actions).toEqual([
      { doc: "5797", target_settlement_id: "SHELL-5797", shell_error: null, moves: ["B"], blocked_open_tour_loads: ["A"] },
    ]);
  });

  it("does not block a load whose CURRENT settlement is open but already IS the document's own shell (no move needed, nothing to pull out of anywhere)", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5805", loads: ["A"] }];
    const liveLoads = new Map([["A", load({ settlement_id: "SHELL-5805", settlement_status: "open" })]]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({ "5805": "SHELL-5805" }));
    expect(plan.actions).toEqual([
      { doc: "5805", target_settlement_id: "SHELL-5805", shell_error: null, moves: [], blocked_open_tour_loads: [] },
    ]);
  });

  it("reports a shell_error and moves nothing when a document has no pre-seeded shell", () => {
    const documents: GroundTruthDoc[] = [{ doc: "9999", loads: ["A"] }];
    const liveLoads = new Map([["A", load({ settlement_id: "SOMETHING", settlement_status: "cancelled" })]]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({}));
    expect(plan.actions).toEqual([
      { doc: "9999", target_settlement_id: null, shell_error: "no pre-seeded shell settlement found (candidates: none)", moves: [], blocked_open_tour_loads: [] },
    ]);
  });

  it("reports a shell_error (never guesses) when more than one non-cancelled settlement already claims a document's ref", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5771", loads: ["A"] }];
    const liveLoads = new Map([["A", load({ settlement_id: "SOMETHING", settlement_status: "cancelled" })]]);
    const plan = planFullRecut(documents, liveLoads, shellsFrom({ "5771": "AMBIGUOUS" }));
    expect(plan.actions[0]!.shell_error).toMatch(/more than one non-cancelled settlement/);
    expect(plan.actions[0]!.target_settlement_id).toBeNull();
    expect(plan.actions[0]!.moves).toEqual([]);
  });

  it("processes documents in ascending numeric order regardless of input order", () => {
    const documents: GroundTruthDoc[] = [{ doc: "5803", loads: [] }, { doc: "5769", loads: [] }];
    const plan = planFullRecut(documents, new Map(), shellsFrom({ "5769": "S1", "5803": "S2" }));
    expect(plan.actions.map((a) => a.doc)).toEqual(["5769", "5803"]);
  });
});
