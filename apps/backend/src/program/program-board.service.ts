// Program Board service — read-side aggregation of ALL repo blocks (from the reconcile JSON that
// `npm run reconcile:blocks` regenerates) + the two curated owner tracks (Owner-Batch + Dispatch-Kit)
// + the two-way notes (agent questions / owner answers+ideas). NON-FINANCIAL internal tooling.
//
// Repo JSON is read at REQUEST TIME from process.cwd() so the board auto-updates whenever the reconcile
// tool regenerates the file (the migration runner + crons already read repo files from cwd at runtime,
// so the repo ships alongside the compiled backend). If a file is unreadable we degrade to an empty
// track rather than 500 — the page still renders the tracks we do have.

import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

const CT_ZONE = "America/Chicago";

// ── repo file locations (relative to repo root = process.cwd() at runtime) ──────────────────────────
const RECON_REL = "docs/trackers/block-reconciliation-data.json";
const EXTRA_REL = "docs/trackers/program-board-extra.json";

// ── types ───────────────────────────────────────────────────────────────────────────────────────────
export type ReconBlock = {
  id: string;
  source: string;
  fin: boolean;
  tier: string;
  status: string;
  evidence: string;
  name: string;
  registered_on: string | null;
  pr: number | null;
};

export type ExtraItem = {
  id: string;
  name: string;
  wave: string;
  type?: string;
  status: string;
  tier: string;
  fin: boolean;
  registered_on: string | null;
  notes?: string;
  track?: "owner-batch" | "dispatch-kit";
};

export type SequenceStep = { step: number; label: string };

export type BoardNote = {
  id: string;
  block_id: string | null;
  kind: "question" | "answer" | "idea" | "note";
  author: "agent" | "owner";
  body: string;
  status: string;
  created_at: string; // ISO
  created_at_ct: string; // America/Chicago formatted
};

export type BoardResponse = {
  generated_at_ct: string;
  source_generated_on: string | null;
  counts: Record<string, number>;
  universe: unknown;
  blocks: ReconBlock[];
  extra: ExtraItem[];
  sequence: SequenceStep[];
  notes: BoardNote[];
  warnings: string[];
};

// ── CT formatting ───────────────────────────────────────────────────────────────────────────────────
export function formatCt(input: Date | string | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayPart = `${get("month")}/${get("day")}/${get("year")}`;
  const timePart = `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
  return `${dayPart} ${timePart} CT`;
}

function readRepoJson<T>(rel: string, warnings: string[], label: string): T | null {
  // Try cwd first (repo root at runtime), then a couple of dist-relative ascents as a fallback.
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(process.cwd(), "..", rel),
    path.join(process.cwd(), "..", "..", rel),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as T;
    } catch {
      // try next candidate
    }
  }
  warnings.push(`could not read ${label} (${rel}) from process.cwd() — track shown empty`);
  return null;
}

// ── notes read (gracefully empty until the gated migration lands) ───────────────────────────────────
async function readNotes(client: pg.PoolClient, warnings: string[]): Promise<BoardNote[]> {
  try {
    const { rows } = await client.query(
      `SELECT id, block_id, kind, author, body, status, created_at
         FROM ops.program_board_notes
        WHERE is_active
        ORDER BY created_at ASC`
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      block_id: (r.block_id as string | null) ?? null,
      kind: r.kind as BoardNote["kind"],
      author: r.author as BoardNote["author"],
      body: String(r.body),
      status: String(r.status),
      created_at: new Date(r.created_at as string).toISOString(),
      created_at_ct: formatCt(r.created_at as string),
    }));
  } catch (err) {
    // Table not present yet (gated migration not applied) → empty, plus the seeded agent questions
    // still come from the extra JSON so the Questions tab is populated.
    warnings.push("ops.program_board_notes not readable yet (gated migration pending) — DB notes empty");
    void err;
    return [];
  }
}

// ── main aggregation ────────────────────────────────────────────────────────────────────────────────
export async function getProgramBoard(client: pg.PoolClient): Promise<BoardResponse> {
  const warnings: string[] = [];

  const recon = readRepoJson<{
    date?: string;
    counts?: Record<string, number>;
    universe?: unknown;
    blocks?: ReconBlock[];
  }>(RECON_REL, warnings, "block reconciliation data");

  const extra = readRepoJson<{
    owner_batch?: ExtraItem[];
    dispatch_kit?: ExtraItem[];
    sequence?: SequenceStep[];
    questions?: Array<Partial<BoardNote> & { created_at?: string }>;
  }>(EXTRA_REL, warnings, "program board extra");

  const dbNotes = await readNotes(client, warnings);

  // Seeded agent questions from the curated JSON (read-side, always present). Give them stable synthetic
  // ids so the frontend can key them; they are merged with DB notes into one stream.
  const seededQuestions: BoardNote[] = (extra?.questions ?? []).map((q, i) => ({
    id: `seed-q-${i}`,
    block_id: q.block_id ?? null,
    kind: (q.kind as BoardNote["kind"]) ?? "question",
    author: (q.author as BoardNote["author"]) ?? "agent",
    body: String(q.body ?? ""),
    status: q.status ?? "open",
    created_at: q.created_at ? new Date(q.created_at).toISOString() : new Date().toISOString(),
    created_at_ct: formatCt(q.created_at ?? new Date()),
  }));

  const extraItems: ExtraItem[] = [
    ...(extra?.owner_batch ?? []).map((it) => ({ ...it, track: "owner-batch" as const })),
    ...(extra?.dispatch_kit ?? []).map((it) => ({ ...it, track: "dispatch-kit" as const })),
  ];

  return {
    generated_at_ct: formatCt(new Date()),
    source_generated_on: recon?.date ?? null,
    counts: recon?.counts ?? {},
    universe: recon?.universe ?? null,
    blocks: recon?.blocks ?? [],
    extra: extraItems,
    sequence: extra?.sequence ?? [],
    notes: [...seededQuestions, ...dbNotes],
    warnings,
  };
}

// ── note insert (owner side; author forced to 'owner' server-side) ──────────────────────────────────
export async function insertOwnerNote(
  client: pg.PoolClient,
  userUuid: string,
  input: { block_id?: string | null; kind: "answer" | "idea" | "note"; body: string }
): Promise<BoardNote> {
  const { rows } = await client.query(
    `INSERT INTO ops.program_board_notes (block_id, kind, author, body, created_by)
     VALUES ($1, $2, 'owner', $3, $4::uuid)
     RETURNING id, block_id, kind, author, body, status, created_at`,
    [input.block_id ?? null, input.kind, input.body, userUuid]
  );
  const r = rows[0] as Record<string, unknown>;
  return {
    id: String(r.id),
    block_id: (r.block_id as string | null) ?? null,
    kind: r.kind as BoardNote["kind"],
    author: r.author as BoardNote["author"],
    body: String(r.body),
    status: String(r.status),
    created_at: new Date(r.created_at as string).toISOString(),
    created_at_ct: formatCt(r.created_at as string),
  };
}
