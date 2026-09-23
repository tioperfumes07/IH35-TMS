// E20 Part A (Lead spec, 2026-09-23) -- the Samsara profile-to-TMS-target resolver.
//
// LAW, verbatim from the spec and repeated in every Round since: "NEVER AUTO-MAP." "An unmatched
// driver stays unmatched and is reported as unmatched; a name that matches two rows is AMBIGUOUS,
// not a pick." This module never writes anything -- it is a pure, side-effect-free suggestion
// engine. It matches on EXACT normalized-name equality only (never a fuzzy/similarity score that
// could silently pick a "close enough" winner -- that is exactly the auto-map this law forbids).
// A caller decides what to do with a suggestion; only a human POST to /samsara/map ever writes.

export type ResolverCandidate = {
  id: string;
  name: string;
};

export type ResolverProfile = {
  samsara_driver_id: string;
  name: string;
};

export type ResolverVerdict =
  | { status: "unmatched" }
  | { status: "matched"; target_id: string }
  | { status: "ambiguous"; candidate_ids: string[] };

export function normalizeCandidateName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve ONE Samsara profile's name against a pool of candidates (drivers, or vendors -- the
 * caller picks the pool). Exact normalized-name equality only. Returns:
 *   - "unmatched"  -- 0 candidates share this normalized name. Reported as unmatched, not an error.
 *   - "matched"    -- exactly 1 candidate shares this normalized name. The only case a caller may
 *                     treat as a suggestion to show (never to auto-apply).
 *   - "ambiguous"  -- 2+ candidates share this normalized name. NEVER a pick -- the caller must
 *                     surface all candidate_ids and let a human choose, or leave it unmatched.
 */
export function resolveProfileAgainstCandidates(
  profile: ResolverProfile,
  candidates: ResolverCandidate[]
): ResolverVerdict {
  const profileName = normalizeCandidateName(profile.name);
  if (!profileName) return { status: "unmatched" };

  const matches = candidates.filter((c) => normalizeCandidateName(c.name) === profileName);
  if (matches.length === 0) return { status: "unmatched" };
  if (matches.length === 1) return { status: "matched", target_id: matches[0]!.id };
  return { status: "ambiguous", candidate_ids: matches.map((c) => c.id) };
}

/** Batch form -- resolves many profiles against the same candidate pool in one pass. */
export function resolveProfilesAgainstCandidates(
  profiles: ResolverProfile[],
  candidates: ResolverCandidate[]
): Map<string, ResolverVerdict> {
  const byName = new Map<string, ResolverCandidate[]>();
  for (const c of candidates) {
    const key = normalizeCandidateName(c.name);
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }

  const out = new Map<string, ResolverVerdict>();
  for (const profile of profiles) {
    const key = normalizeCandidateName(profile.name);
    if (!key) {
      out.set(profile.samsara_driver_id, { status: "unmatched" });
      continue;
    }
    const matches = byName.get(key) ?? [];
    if (matches.length === 0) out.set(profile.samsara_driver_id, { status: "unmatched" });
    else if (matches.length === 1) out.set(profile.samsara_driver_id, { status: "matched", target_id: matches[0]!.id });
    else out.set(profile.samsara_driver_id, { status: "ambiguous", candidate_ids: matches.map((c) => c.id) });
  }
  return out;
}
