import { afterEach, describe, expect, it, vi } from "vitest";

// A pg-like client whose query always throws → readNotes() degrades to an empty notes list, so the
// aggregation needs no real database. The board still builds from the committed repo JSON fixtures.
function fakeClient() {
  return {
    query: vi.fn(async () => {
      throw new Error("no db in unit test");
    }),
  } as unknown as import("pg").PoolClient;
}

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.doUnmock("../storage/r2-client.js");
  vi.resetModules();
});

describe("getProgramBoard — program-board-meta.json", () => {
  it("parses the committed meta file and surfaces it on the board (no meta warning)", async () => {
    vi.resetModules();
    const { getProgramBoard } = await import("./program-board.service.js");
    const board = await getProgramBoard(fakeClient());

    expect(board).toHaveProperty("meta");
    expect(board.meta).not.toBeNull();
    // Placeholder fixture shape: tabs + deltas present (sync engine populates values for real).
    expect(board.meta).toMatchObject({
      tabs: expect.any(Object),
      deltas: expect.objectContaining({
        added: expect.any(Array),
        completed: expect.any(Array),
      }),
    });
    // A present, parseable file must NOT emit the meta-read warning.
    expect(board.warnings.some((w) => w.includes("program board meta"))).toBe(false);
  });

  it("degrades to meta:null + a warning when the file is absent/unparseable — never throws", async () => {
    vi.resetModules();
    const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    // Simulate the meta file being missing while every other repo JSON stays readable.
    vi.doMock("node:fs", () => ({
      ...realFs,
      default: realFs,
      readFileSync: (p: import("node:fs").PathOrFileDescriptor, ...rest: unknown[]) => {
        if (String(p).includes("program-board-meta.json")) {
          throw new Error("ENOENT (simulated absence)");
        }
        return (realFs.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
      },
    }));

    const { getProgramBoard } = await import("./program-board.service.js");
    const board = await getProgramBoard(fakeClient());

    expect(board.meta).toBeNull();
    expect(board.warnings.some((w) => w.includes("program board meta"))).toBe(true);
  });
});

describe("getProgramBoard — R2 live snapshot (R2-first, committed-JSON fallback)", () => {
  it("reads meta + per-row lifecycle from the R2 snapshot FIRST, overlaying the committed rows", async () => {
    vi.resetModules();
    // First, read the committed fallback to grab a REAL block key (id + name) to target with the overlay.
    const base = await (await import("./program-board.service.js")).getProgramBoard(fakeClient());
    const b0 = base.blocks[0];
    expect(b0).toBeTruthy();

    vi.resetModules();
    vi.doMock("../storage/r2-client.js", () => ({
      getObjectTextIfExists: vi.fn(async () =>
        JSON.stringify({
          generated_at_iso: "2026-07-05T18:00:00Z",
          meta: {
            last_synced_ct: "2026-07-05 12:00 CT",
            deploy_version: "R2SHA99",
            tabs: {},
            deltas: { since: null, added: [], completed: [] },
          },
          live: {
            [`block::${b0.id}::${b0.name}`]: { live_state: "deployed-by-r2test", lifecycle: "deployed" },
          },
        })
      ),
    }));

    const { getProgramBoard } = await import("./program-board.service.js");
    const board = await getProgramBoard(fakeClient());

    // meta came from R2 (distinctive sentinel), not the committed file.
    expect(board.meta?.deploy_version).toBe("R2SHA99");
    // the targeted committed block row got its LIVE fields overlaid from R2.
    const overlaid = board.blocks.find((b) => b.id === b0.id && b.name === b0.name) as
      | (typeof b0 & { live_state?: string; lifecycle?: string })
      | undefined;
    expect(overlaid?.live_state).toBe("deployed-by-r2test");
    expect(overlaid?.lifecycle).toBe("deployed");
  });

  it("falls back to the committed meta when the R2 snapshot is absent (getObjectTextIfExists → null)", async () => {
    vi.resetModules();
    vi.doMock("../storage/r2-client.js", () => ({
      getObjectTextIfExists: vi.fn(async () => null),
    }));

    const { getProgramBoard } = await import("./program-board.service.js");
    const board = await getProgramBoard(fakeClient());

    // No R2 snapshot → committed meta fixture still surfaces; the page never 500s.
    expect(board.meta).not.toBeNull();
    expect(board.blocks.length).toBeGreaterThan(0);
  });
});
