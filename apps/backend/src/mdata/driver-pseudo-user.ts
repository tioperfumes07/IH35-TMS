/** System placeholder drivers used for referential integrity on auto-generated safety events. */
export const PSEUDO_DRIVER_DISPLAY_NAMES = ["Safety Safety", "System System"] as const;

export const PSEUDO_DRIVER_CDL_NUMBERS = ["safety", "system"] as const;

export function driverDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`.trim();
}

export function isPseudoDriverRow(row: {
  first_name?: string | null;
  last_name?: string | null;
  cdl_number?: string | null;
  is_pseudo?: boolean | null;
}): boolean {
  if (row.is_pseudo === true) return true;
  const displayName = driverDisplayName(row.first_name, row.last_name);
  if ((PSEUDO_DRIVER_DISPLAY_NAMES as readonly string[]).includes(displayName)) return true;
  const cdl = String(row.cdl_number ?? "")
    .trim()
    .toLowerCase();
  return (PSEUDO_DRIVER_CDL_NUMBERS as readonly string[]).includes(cdl);
}

// Exclude system pseudo-users from human listings. They are required by referential integrity for system-
// generated events and must NOT be deleted.
export const EXCLUDE_PSEUDO_DRIVERS_SQL = `(
  TRIM(first_name) || ' ' || TRIM(last_name) NOT IN ('Safety Safety', 'System System')
  AND (cdl_number IS NULL OR lower(trim(cdl_number)) NOT IN ('safety', 'system'))
)`;
