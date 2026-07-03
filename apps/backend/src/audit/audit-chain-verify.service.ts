import type { PoolClient } from "pg";

// B19-V2 — audit hash-chain verifier (spec §4, genesis-anchor). Recomputes every event's hash IN SQL via
// the same events.calculate_event_hash function (guaranteeing byte-for-byte parity with the write path), and
// checks the post-anchor chain linkage by chain_seq order. Records the result in ops.audit_chain_verifications.
// Read-only against events.event_log (never writes/deletes it). Two regimes:
//   • per-row hash recompute — ALL rows (catches content tampering regardless of regime)
//   • prev_hash linkage — POST-anchor rows only (chain_seq IS NOT NULL; pre-anchor order was never captured)
// (Implementation note: the spec's illustrative `lag(...) FILTER(...)` is not valid SQL — FILTER can't be
//  applied to a window function — so the lag runs over a CTE already filtered to chain_seq IS NOT NULL.)

export const VERIFIER_VERSION = "b19-v2-genesis-anchor-1";

export type ChainVerifyResult = {
  events_checked: number;
  hash_breaks: number;
  link_breaks: number;
  chain_ok: boolean;
  first_break_seq: string | null;
};

export async function verifyEventChain(
  client: PoolClient,
  operatingCompanyId: string,
): Promise<ChainVerifyResult> {
  const res = await client.query<{
    events_checked: string;
    hash_breaks: string;
    link_breaks: string;
    first_break_seq: string | null;
  }>(
    `
      WITH all_rows AS (
        SELECT event_id, chain_seq, prev_hash, hash,
               events.calculate_event_hash(prev_hash, event_id, occurred_at, actor_id, event_type, subject_id, payload)
                 AS recomputed
        FROM events.event_log
        WHERE operating_company_id = $1::uuid AND is_active = true
      ),
      post_anchor AS (
        SELECT chain_seq, prev_hash,
               lag(hash) OVER (ORDER BY chain_seq) AS expected_prev
        FROM all_rows
        WHERE chain_seq IS NOT NULL
      ),
      breaks AS (
        SELECT chain_seq FROM all_rows WHERE recomputed <> hash                       -- content tamper (any row)
        UNION ALL
        SELECT chain_seq FROM post_anchor WHERE prev_hash IS DISTINCT FROM expected_prev  -- link tamper (post-anchor)
      )
      SELECT
        (SELECT count(*) FROM all_rows)::bigint AS events_checked,
        (SELECT count(*) FROM all_rows WHERE recomputed <> hash)::bigint AS hash_breaks,
        (SELECT count(*) FROM post_anchor WHERE prev_hash IS DISTINCT FROM expected_prev)::bigint AS link_breaks,
        (SELECT min(chain_seq) FROM breaks WHERE chain_seq IS NOT NULL) AS first_break_seq
    `,
    [operatingCompanyId],
  );

  const r = res.rows[0];
  const hashBreaks = Number(r?.hash_breaks ?? 0);
  const linkBreaks = Number(r?.link_breaks ?? 0);
  const chainOk = hashBreaks === 0 && linkBreaks === 0;
  const firstBreakSeq = r?.first_break_seq ?? null;

  await client.query(
    `
      INSERT INTO ops.audit_chain_verifications
        (operating_company_id, events_checked, hash_breaks, link_breaks, chain_ok, first_break_seq, verifier_version)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
    `,
    [operatingCompanyId, Number(r?.events_checked ?? 0), hashBreaks, linkBreaks, chainOk, firstBreakSeq, VERIFIER_VERSION],
  );

  return {
    events_checked: Number(r?.events_checked ?? 0),
    hash_breaks: hashBreaks,
    link_breaks: linkBreaks,
    chain_ok: chainOk,
    first_break_seq: firstBreakSeq,
  };
}
