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
 * ACTIVE ROWS ONLY. A match against a deactivated/archived driver is a REHIRE, which is what
 * findReturningDriverMatches already handles; duplicating that here would double-warn on one event.
 *
 * THIS WARNS, IT DOES NOT DECIDE. Two different people genuinely can share a name. The caller is given
 * the matches and must pass an explicit override, so the operator resolves it with the record in front
 * of them rather than the system silently merging or silently duplicating.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type RosterDuplicateMatch = {
  driver_id: string;
  full_name: string;
  cdl_number: string | null;
  created_at: string;
  /** Why this row matched — the strongest signal first. */
  matched_on: "cdl_exact" | "curp_exact" | "name_exact";
};

export type RosterDuplicateInput = {
  operating_company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  cdl_number?: string | null;
  cdl_state?: string | null;
  curp?: string | null;
};

function norm(value: string | null | undefined): string | null {
  const t = (value ?? "").trim().toUpperCase();
  return t.length > 0 ? t : null;
}

/** Full name normalised the same way on both sides of the comparison. */
function normName(first?: string | null, last?: string | null): string | null {
  const joined = [first ?? "", last ?? ""].join(" ").replace(/\s+/g, " ").trim().toUpperCase();
  return joined.length > 0 ? joined : null;
}

export async function findRosterDuplicates(
  client: Queryable,
  input: RosterDuplicateInput
): Promise<RosterDuplicateMatch[]> {
  const fullName = normName(input.first_name, input.last_name);
  const cdl = norm(input.cdl_number);
  const cdlState = norm(input.cdl_state);
  const curp = norm(input.curp);
  if (!fullName && !cdl && !curp) return [];

  const res = await client.query<RosterDuplicateMatch>(
    `
      SELECT d.id::text AS driver_id,
             trim(concat_ws(' ', d.first_name, d.last_name)) AS full_name,
             d.cdl_number,
             d.created_at::text AS created_at,
             CASE
               WHEN $3::text IS NOT NULL AND upper(trim(d.curp)) = $3 THEN 'curp_exact'
               WHEN $2::text IS NOT NULL AND upper(trim(d.cdl_number)) = $2
                    AND ($5::text IS NULL OR upper(trim(d.cdl_state)) = $5) THEN 'cdl_exact'
               ELSE 'name_exact'
             END AS matched_on
        FROM mdata.drivers d
       WHERE d.operating_company_id = $1::uuid
         AND d.deactivated_at IS NULL
         AND d.archived_at IS NULL
         AND (
              ($3::text IS NOT NULL AND upper(trim(d.curp)) = $3)
           OR ($2::text IS NOT NULL AND upper(trim(d.cdl_number)) = $2
               AND ($5::text IS NULL OR upper(trim(d.cdl_state)) = $5))
           OR ($4::text IS NOT NULL
               AND upper(regexp_replace(trim(concat_ws(' ', d.first_name, d.last_name)), '\\s+', ' ', 'g')) = $4)
         )
       ORDER BY d.created_at ASC
       LIMIT 10
    `,
    [input.operating_company_id, cdl, curp, fullName, cdlState]
  );
  return res.rows;
}
