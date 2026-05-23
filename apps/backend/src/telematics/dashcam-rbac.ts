export function canAccessDashcam(roleRaw: string | null | undefined) {
  const role = String(roleRaw ?? "").trim().toLowerCase();
  return role === "owner" || role === "administrator" || role === "safety_lead";
}
