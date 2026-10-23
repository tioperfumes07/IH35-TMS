/**
 * ROUND 443.250 — proper-case display names (owner: automatically format person/business names).
 * CC-1 owns write-path + backfill; Cursor applies the same rules on render.
 * Exact typed text stays in as-entered fields for audit — this is display-only.
 */

const ENTITY_SUFFIXES = new Set([
  "llc",
  "inc",
  "corp",
  "co",
  "lp",
  "llp",
  "dba",
  "sa",
  "de",
  "cv",
  "rl",
  "s.a.",
  "s.a",
  "s.de",
  "s.a.de",
  "s.de.r.l",
  "s.de.r.l.",
]);

const ACRONYMS = new Set([
  "usa",
  "usmca",
  "tx",
  "wex",
  "tms",
  "ih",
  "ltl",
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "dc",
]);

const ROMAN = new Set(["ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

function stripPunct(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "");
}

function titleWord(raw: string, index: number, total: number): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const core = stripPunct(lower);
  const trailing = raw.slice(stripPunct(raw).length);
  const leading = raw.slice(0, raw.length - stripPunct(raw).length - trailing.length);

  if (ACRONYMS.has(core) || ENTITY_SUFFIXES.has(core.replace(/\./g, "")) || ROMAN.has(core)) {
    return leading + core.toUpperCase() + trailing;
  }
  if (index > 0 && index < total - 1 && PARTICLES.has(core)) {
    return leading + core + trailing;
  }
  // Mc/Mac/O'
  const mMc = /^mc([a-z].*)$/i.exec(core);
  if (mMc) return leading + "Mc" + mMc[1].charAt(0).toUpperCase() + mMc[1].slice(1).toLowerCase() + trailing;
  const mMac = /^mac([a-z].*)$/i.exec(core);
  if (mMac && mMac[1].length > 2) {
    return leading + "Mac" + mMac[1].charAt(0).toUpperCase() + mMac[1].slice(1).toLowerCase() + trailing;
  }
  const mO = /^o'([a-z].*)$/i.exec(core);
  if (mO) return leading + "O'" + mO[1].charAt(0).toUpperCase() + mO[1].slice(1).toLowerCase() + trailing;

  return leading + core.charAt(0).toUpperCase() + core.slice(1).toLowerCase() + trailing;
}

/** Display-only proper case. Empty/null → "". */
export function formatDisplayName(input: string | null | undefined): string {
  if (input == null) return "";
  const trimmed = String(input).trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const parts = trimmed.split(" ");
  return parts.map((p, i) => titleWord(p, i, parts.length)).join(" ");
}
