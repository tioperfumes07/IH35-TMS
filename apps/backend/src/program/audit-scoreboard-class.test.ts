import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { classCellFor, classCellVerified, readClassScoreboardFromQueue } from "./audit-scoreboard.routes.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import path from "node:path";

// PROG-CLASS-STALE. The Programs by-class grid used to render from a COMMITTED TS module, so a class
// changing status in docs/audit/wave-queue.json could not reach an open board without a frontend
// redeploy — and on 2026-08-07 the module described 26 classes while the queue held 31.
//
// These tests exercise the real queue file on disk, not a fixture, because the defect was precisely
// that the shipped artifact and the source of truth had drifted apart. A fixture would have passed
// throughout the entire period the board was wrong.
const QUEUE = path.join(resolveMonorepoRoot(import.meta.url), "docs/audit/wave-queue.json");
const REPO_ROOT = resolveMonorepoRoot(import.meta.url);

describe("by-class scoreboard — colour law", () => {
  // Owner-stated 2026-08-07: drained=green, draining/in-progress=amber, open/not-started=neutral,
  // blocked=red. Red is RESERVED for blocked; the previous mapping spent it on ordinary open classes.
  it("maps each queue status to the owner's colour", () => {
    expect(classCellFor("drained")).toMatchObject({ code: "CC", tone: "green" });
    expect(classCellFor("draining")).toMatchObject({ code: "BB", tone: "amber" });
    expect(classCellFor("in_progress")).toMatchObject({ code: "BB", tone: "amber" });
    expect(classCellFor("blocked")).toMatchObject({ code: "XX", tone: "red" });
    expect(classCellFor("open")).toMatchObject({ code: "NN", tone: "grey" });
  });

  it("is case- and whitespace-insensitive, and treats an unknown status as open rather than blocked", () => {
    expect(classCellFor("  DRAINED ")).toMatchObject({ code: "CC" });
    expect(classCellFor("Draining")).toMatchObject({ code: "BB" });
    // An unrecognised status must never fall into the red bucket — that would report a class as
    // blocked purely because someone typed a new word into the queue.
    expect(classCellFor("something-new")).toMatchObject({ code: "NN", tone: "grey" });
  });
});

describe("by-class scoreboard — served from the live queue", () => {
  const original = readFileSync(QUEUE, "utf8");
  afterEach(() => writeFileSync(QUEUE, original));

  it("returns one row per wave in the committed queue", async () => {
    const queue = JSON.parse(original) as { waves: Array<{ id: string; status: string }> };
    const board = await readClassScoreboardFromQueue();
    expect(board).not.toBeNull();
    expect(board!.rows).toHaveLength(queue.waves.length);
    expect(board!.summary.total).toBe(queue.waves.length);
    // Every class in the queue has a cell. The shipped board was missing two entirely.
    const rendered = new Set(board!.rows.map((r) => r.id));
    for (const w of queue.waves) expect(rendered.has(w.id)).toBe(true);
  });

  it("counts drained only when the named guard file exists on disk", async () => {
    const queue = JSON.parse(original) as {
      waves: Array<{ status: string; guard?: string }>;
    };
    const verifiedDrained = queue.waves.filter((w) => {
      const guard = typeof w.guard === "string" && w.guard ? w.guard : null;
      const guardExists = guard != null && existsSync(path.join(REPO_ROOT, guard));
      return classCellVerified(String(w.status ?? ""), guard, guardExists).code === "CC";
    }).length;
    const count = (s: string) => queue.waves.filter((w) => w.status === s).length;
    const board = (await readClassScoreboardFromQueue())!;
    expect(board.summary.drained).toBe(verifiedDrained);
    expect(board.summary.building).toBeGreaterThanOrEqual(count("draining"));
    expect(board.summary.notStarted).toBeLessThanOrEqual(queue.waves.length);
  });

  // THE REACTIVITY PROPERTY, and the reason this is a request-time read rather than a build artifact:
  // editing the queue must change the next read with no rebuild, no regeneration and no redeploy.
  it("reflects a status change on the very next read", async () => {
    const before = (await readClassScoreboardFromQueue())!;
    const target = before.rows.find((r) => r.code === "NN");
    expect(target, "expected at least one open class to flip").toBeTruthy();

    const queue = JSON.parse(original) as {
      waves: Array<{ id: string; status: string; guard?: string }>;
    };
    const wave = queue.waves.find((w) => w.id === target!.id)!;
    wave.status = "drained";
    // Owner 2026-08-08: green CC requires the guard file on disk — not queue theater.
    wave.guard = "scripts/verify-no-silent-list-caps.mjs";
    writeFileSync(QUEUE, `${JSON.stringify(queue, null, 2)}\n`);

    const after = (await readClassScoreboardFromQueue())!;
    const flipped = after.rows.find((r) => r.id === target!.id)!;
    expect(flipped.code).toBe("CC");
    expect(flipped.tone).toBe("green");
    expect(after.summary.drained).toBe(before.summary.drained + 1);
    expect(after.summary.notStarted).toBe(before.summary.notStarted - 1);
  });

  it("does not colour a cell red just because the class is money-critical", async () => {
    const queue = JSON.parse(original) as { waves: Array<{ id: string; status: string; drain_proof?: Record<string, unknown> }> };
    const wave = queue.waves.find((w) => w.status === "open")!;
    wave.drain_proof = { ...(wave.drain_proof ?? {}), money_critical: true };
    writeFileSync(QUEUE, `${JSON.stringify(queue, null, 2)}\n`);

    const row = (await readClassScoreboardFromQueue())!.rows.find((r) => r.id === wave.id)!;
    // Neutral cell, but the signal is not lost — it rides on its own flag.
    expect(row.tone).toBe("grey");
    expect(row.code).toBe("NN");
    expect(row.liveDefect).toBe(true);
  });
});
