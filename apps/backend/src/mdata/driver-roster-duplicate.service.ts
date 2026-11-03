/**
 * ROSTER DUPLICATE DETECTION — catch a duplicate driver against the LIVE roster, at creation.
 *
 * THE GAP, PROVEN ON PROD 2026-08-03 (positive control mdata.vendors = 2,828). TRANSP carries three
 * pairs of ACTIVE same-name drivers, and every one slipped past the existing check:
 *
 *   CARLOS GALAVIZ                 2 rows, IDENTICAL CDL LFD01237194, both created 2026-05-31
 *   JOSE MANUEL MEJIA OLMOS        2 rows, CDL NULL on both, created 07-16 and 07-27
 *   JUAN PABLO HERNANDEZ ESTRADA   2 rows, CDL TAMP310697 vs TAMP310637 — ONE DIGIT apart
 *
 * WHY THE EXISTING CHECK MISSED ALL THREE. findReturningDriverMatches() matches CURP or CDL+state
 * against EVENT SNAPSHOTS (e.curp_snapshot / e.cdl_number_snapshot) — the rehire/termination history.
 * A driver being entered for the first time has no prior event, so there is nothing to match against:
 * even CARLOS, with a byte-identical CDL already on the roster, produced no hit. That check answers
 * "have we employed this person before?", which is a different question from "is this person already
 * on the roster right now?" — and only the first was ever asked.
 *
 * NAME IS THE CHECK THAT WOULD HAVE CAUGHT ALL THREE: one pair shares a CDL, one has no CDL at all,
 * and one has a single-digit typo. No identifier-based rule catches that set; the name does.
 *
 * SAME-ENTITY ONLY, DELIBERATELY. A driver may legitimately work for TRANSP and USMCA and hold a row
 * in each — USMCA carries its own CARLOS GALAVIZ pair. Flagging across entities would train the
 * operator to click through a warning that is usually wrong, which is how a real warning stops working.
 *
 * ALL ROSTER ROWS — ACTIVE AND INACTIVE (LEAD 11-03, owner 9:38 AM CT: "when a driver appears as near duplicate
 * we should be asked, instead of creating a new one"). The 07-04 and 08-21 roster imports re-created 65 people a
 * second time; most of the copies are INACTIVE / deactivated, so the old active-only check could never see them.
 * An inactive match now comes back with state 'inactive' / 'deactivated' / 'archived' — the operator reopens that
 * profile instead of creating another (only one driver profile per person in the app).
 *
 * NEAR MATCHES (same 11-03 order): the measured USMCA near-duplicates were a shorter or reordered form of the same
 * name ("angel alfonso sosa" ↔ "angel alfonso sosa perez", "neftali urbano coronado" ↔ "neftali coronado urbano"),
 * a one-letter typo, or a CDL one character off ("…0697" ↔ "…0637"). Each is a named reason below.
 *
 * THIS WARNS, IT DOES NOT DECIDE. Two different people genuinely can share a name. The caller is given
 * the matches and must pass an explicit override, so the operator resolves it with the record in front
 * of them rather than the system silently merging or silently duplicating.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type RosterMatchReason =
  | "cdl_exact"
  | "curp_exact"
  | "passport_exact"
  | "phone_exact"
  | "name_exact"
  | "name_reordered"
  | "name_contains"
  | "name_typo"
  | "cdl_one_char";

export type RosterDuplicateMatch = {
  driver_id: string;
  full_name: string;
  cdl_number: string | null;
  created_at: string;
  /** Strongest reason first (kept for the existing callers). */
  matched_on: RosterMatchReason;
  /** Every reason this row matched, strongest first. */
  reasons: RosterMatchReason[];
  /** 'hard' = same identifier; 'strong' = same / reordered name; 'possible' = contained name, typo, CDL one char off. */
  strength: "hard" | "strong" | "possible";
  /** Where the existing profile stands — an inactive one is reopened, never duplicated. */
  state: "active" | "inactive" | "deactivated" | "archived";
  status: string | null;
  phone_last4: string | null;
};

export type RosterDuplicateInput = {
  operating_company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  cdl_number?: string | null;
  cdl_state?: string | null;
  curp?: string | null;
  passport_number?: string | null;
  phone?: string | null;
};

export type RosterRow = {
  driver_id: string;
  first_name: string | null;
  last_name: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  curp: string | null;
  passport_number: string | null;
  phone: string | null;
  status: string | null;
  deactivated_at: string | null;
  archived_at: string | null;
  created_at: string;
};

function norm(value: string | null | undefined): string | null {
  const t = (value ?? "").trim().toUpperCase();
  return t.length > 0 ? t : null;
}

/** Accent-free, upper-case, single-spaced full name. */
export function normalizePersonName(first?: string | null, last?: string | null): string | null {
  const joined = [first ?? "", last ?? ""]
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return joined.length > 0 ? joined : null;
}

function phoneKey(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Plain Levenshtein distance, bounded — names are short. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function oneCharApart(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 6) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return diff === 1;
}

const ORDER: RosterMatchReason[] = [
  "curp_exact",
  "cdl_exact",
  "passport_exact",
  "phone_exact",
  "name_exact",
  "name_reordered",
  "name_contains",
  "cdl_one_char",
  "name_typo",
];

/**
 * Pure scoring — every reason `row` is the same person as `input`, strongest first. Empty = not a match.
 * Name rules need at least two name tokens on each side so a lone first name never matches a roster.
 */
export function scoreRosterCandidate(input: RosterDuplicateInput, row: RosterRow): RosterMatchReason[] {
  const reasons = new Set<RosterMatchReason>();
  const cdlIn = norm(input.cdl_number);
  const cdlRow = norm(row.cdl_number);
  const stateIn = norm(input.cdl_state);
  const stateRow = norm(row.cdl_state);
  if (norm(input.curp) && norm(input.curp) === norm(row.curp)) reasons.add("curp_exact");
  if (cdlIn && cdlRow && cdlIn === cdlRow && (!stateIn || !stateRow || stateIn === stateRow)) reasons.add("cdl_exact");
  if (cdlIn && cdlRow && oneCharApart(cdlIn, cdlRow)) reasons.add("cdl_one_char");
  if (norm(input.passport_number) && norm(input.passport_number) === norm(row.passport_number)) reasons.add("passport_exact");
  const phIn = phoneKey(input.phone);
  if (phIn && phIn === phoneKey(row.phone)) reasons.add("phone_exact");

  const nameIn = normalizePersonName(input.first_name, input.last_name);
  const nameRow = normalizePersonName(row.first_name, row.last_name);
  if (nameIn && nameRow) {
    const tIn = nameIn.split(" ");
    const tRow = nameRow.split(" ");
    if (nameIn === nameRow) reasons.add("name_exact");
    else if (tIn.length >= 2 && tRow.length >= 2) {
      const sortedIn = [...tIn].sort().join(" ");
      const sortedRow = [...tRow].sort().join(" ");
      if (sortedIn === sortedRow) reasons.add("name_reordered");
      else if (tIn[0] === tRow[0]) {
        const setIn = new Set(tIn);
        const setRow = new Set(tRow);
        const inSubset = tIn.every((t) => setRow.has(t));
        const rowSubset = tRow.every((t) => setIn.has(t));
        if (inSubset || rowSubset) reasons.add("name_contains");
      }
      if (!reasons.has("name_reordered") && !reasons.has("name_contains") && Math.min(nameIn.length, nameRow.length) >= 8) {
        const dist = editDistance(nameIn, nameRow);
        if (dist > 0 && dist <= 2) reasons.add("name_typo");
      }
    }
  }
  return ORDER.filter((r) => reasons.has(r));
}

function strengthOf(reasons: RosterMatchReason[]): RosterDuplicateMatch["strength"] {
  if (reasons.some((r) => r === "cdl_exact" || r === "curp_exact" || r === "passport_exact")) return "hard";
  if (reasons.some((r) => r === "name_exact" || r === "name_reordered" || r === "phone_exact")) return "strong";
  return "possible";
}

function stateOf(row: RosterRow): RosterDuplicateMatch["state"] {
  if (row.archived_at) return "archived";
  if (row.deactivated_at) return "deactivated";
  if ((row.status ?? "").toLowerCase() === "inactive") return "inactive";
  return "active";
}

/** Pure ranking over a fetched roster — exported for tests and for importers that already hold the rows. */
export function rankRosterDuplicates(input: RosterDuplicateInput, roster: RosterRow[], limit = 10): RosterDuplicateMatch[] {
  const rank = { hard: 0, strong: 1, possible: 2 } as const;
  const stateRank = { active: 0, inactive: 1, deactivated: 2, archived: 3 } as const;
  return roster
    .map((row) => ({ row, reasons: scoreRosterCandidate(input, row) }))
    .filter((x) => x.reasons.length > 0)
    .map(({ row, reasons }) => {
      const digits = (row.phone ?? "").replace(/\D/g, "");
      return {
        driver_id: row.driver_id,
        full_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
        cdl_number: row.cdl_number,
        created_at: row.created_at,
        matched_on: reasons[0],
        reasons,
        strength: strengthOf(reasons),
        state: stateOf(row),
        status: row.status,
        phone_last4: digits.length >= 4 ? digits.slice(-4) : null,
      } satisfies RosterDuplicateMatch;
    })
    .sort((a, b) => rank[a.strength] - rank[b.strength] || stateRank[a.state] - stateRank[b.state] || a.created_at.localeCompare(b.created_at))
    .slice(0, limit);
}

/**
 * Every roster row (any state) of the company that could be the same person. Same entity only (see header).
 */
export async function findRosterDuplicates(client: Queryable, input: RosterDuplicateInput): Promise<RosterDuplicateMatch[]> {
  if (!input.operating_company_id) return [];
  if (!normalizePersonName(input.first_name, input.last_name) && !norm(input.cdl_number) && !norm(input.curp)) return [];
  const res = await client.query<RosterRow>(
    `
      SELECT d.id::text AS driver_id, d.first_name, d.last_name, d.cdl_number, d.cdl_state, d.curp,
             d.passport_number, d.phone, d.status::text AS status,
             d.deactivated_at::text AS deactivated_at, d.archived_at::text AS archived_at,
             d.created_at::text AS created_at
        FROM mdata.drivers d
       WHERE d.operating_company_id = $1::uuid
       ORDER BY d.created_at ASC
    `,
    [input.operating_company_id]
  );
  return rankRosterDuplicates(input, res.rows);
}
