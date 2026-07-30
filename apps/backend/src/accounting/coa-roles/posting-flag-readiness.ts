// Posting-flag readiness — READ-ONLY. Answers one question the CoA Roles screen could not answer:
// "which money-posting features can this entity actually run right now, and what is missing?"
//
// WHY THIS EXISTS (2026-07-30). The validate endpoint returned `valid: true` and the screen said "All
// required roles have active mappings" while THREE posting features were unusable on every entity —
// because their roles are classed OPTIONAL, so `required_roles` never mentioned them. Every poster
// resolves its accounts through resolveRoleAccount(), which THROWS CoaRoleResolutionError when the role
// has no active binding; it does not degrade or warn. safety-fine-posting/poster.service.ts:232 says so
// outright: "has NO shape-fallback entry, so this THROWS ... until the owner designates."
//
// So the screen was green while the feature was dead. That is a silent failure, and silent failures are
// the thing this system is not allowed to have. This module makes the gap visible and actionable
// WITHOUT deciding any GL mapping — it only reports which roles a poster needs and whether they are
// bound. Choosing the account for a role stays an owner designation, made in the UI.
//
// The flag -> roles map is read from config/posting-flag-requirements.json, the SAME file the CI guard
// (scripts/verify-posting-flags-require-bound-accounts.mjs) reads. One source, two consumers: a second
// copy is precisely how the local and CI branch-freshness gates drifted into contradicting each other.

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveMonorepoRoot } from "../../lib/monorepo-root.js";

const ROOT = resolveMonorepoRoot(import.meta.url);

type RequirementsFile = {
  requirements: Record<string, string[]>;
  labels?: Record<string, string>;
};

let cached: RequirementsFile | null = null;

/** Honest failure: an unreadable/!malformed map THROWS rather than reporting a fabricated "all clear". */
export function loadPostingFlagRequirements(): RequirementsFile {
  if (cached) return cached;
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, "config/posting-flag-requirements.json"), "utf8")
  ) as RequirementsFile;
  if (!parsed || typeof parsed.requirements !== "object" || Object.keys(parsed.requirements).length === 0) {
    throw new Error("posting-flag-requirements.json has no requirements — refusing to report readiness");
  }
  cached = parsed;
  return parsed;
}

export type PostingFeatureReadiness = {
  flag_key: string;
  label: string;
  required_roles: string[];
  missing_roles: string[];
  ready: boolean;
  flag_enabled: boolean;
  /** ON with unbound roles: the poster will throw on first use. The loudest state on the screen. */
  armed_but_blocked: boolean;
};

/**
 * Pure so it is testable without a database.
 * @param mappedRoles roles with an ACTIVE binding for this entity
 * @param enabledFlags posting flags currently ON for this entity
 */
export function computePostingFeatureReadiness(
  mappedRoles: Set<string>,
  enabledFlags: Set<string>,
  file: RequirementsFile = loadPostingFlagRequirements()
): PostingFeatureReadiness[] {
  return Object.entries(file.requirements)
    .map(([flagKey, roles]) => {
      const missing = roles.filter((role) => !mappedRoles.has(role));
      const enabled = enabledFlags.has(flagKey);
      return {
        flag_key: flagKey,
        label: file.labels?.[flagKey] ?? flagKey,
        required_roles: roles,
        missing_roles: missing,
        ready: missing.length === 0,
        flag_enabled: enabled,
        armed_but_blocked: enabled && missing.length > 0,
      };
    })
    .sort((a, b) => {
      // Worst first: armed-but-blocked, then blocked, then ready.
      const rank = (r: PostingFeatureReadiness) => (r.armed_but_blocked ? 0 : r.ready ? 2 : 1);
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });
}
