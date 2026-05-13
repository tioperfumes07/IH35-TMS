function canViewOfficeDriverBills(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export function canAccessDriverLoadBills(role: string, userId: string, primaryIdentity: unknown, secondaryIdentity: unknown) {
  if (canViewOfficeDriverBills(role)) return true;
  const primary = String(primaryIdentity ?? "");
  const secondary = String(secondaryIdentity ?? "");
  return userId === primary || userId === secondary;
}
