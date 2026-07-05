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
