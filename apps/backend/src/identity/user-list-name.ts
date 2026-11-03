/**
 * Row 233 (live 11-03) — never fabricate the bare word "User" (14 rows rendered "User") nor an email local-part
 * ("codex.test.driver0034"): label fallback is full name → email → "Invited user (<role>)".
 */
export function userListName(fullName: string, email: string | null | undefined, role: unknown): string {
  const n = fullName.trim();
  if (n) return n;
  const e = String(email ?? "").trim();
  if (e) return e;
  return `Invited user (${String(role ?? "").trim() || "no role"})`;
}
