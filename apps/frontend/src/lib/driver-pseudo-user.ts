import type { Driver } from "../types/api";

export const PSEUDO_DRIVER_DISPLAY_NAMES = ["Safety Safety", "System System"] as const;

export const PSEUDO_DRIVER_CDL_NUMBERS = ["safety", "system"] as const;

export function driverDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${String(firstName ?? "").trim()} ${String(lastName ?? "").trim()}`.trim();
}

export function isPseudoDriver(driver: Pick<Driver, "first_name" | "last_name" | "cdl_number">): boolean {
  const displayName = driverDisplayName(driver.first_name, driver.last_name);
  if ((PSEUDO_DRIVER_DISPLAY_NAMES as readonly string[]).includes(displayName)) return true;
  const cdl = String(driver.cdl_number ?? "")
    .trim()
    .toLowerCase();
  return (PSEUDO_DRIVER_CDL_NUMBERS as readonly string[]).includes(cdl);
}

export function filterHumanDrivers<T extends Pick<Driver, "first_name" | "last_name" | "cdl_number">>(drivers: T[]): T[] {
  return drivers.filter((driver) => !isPseudoDriver(driver));
}
