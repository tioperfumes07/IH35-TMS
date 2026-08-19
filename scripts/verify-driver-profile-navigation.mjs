#!/usr/bin/env node
/**
 * verify-driver-profile-navigation
 *
 * Locks the driver-profile navigation fixes (owner-batch D1/D2/D3) so they can't silently regress:
 *
 *   D2 — "Open profile → Driver not found". The profile must derive the driver identity from the
 *        company-scoped AGGREGATE (`/api/v1/mdata/drivers/:id?operating_company_id=…`, which honors the
 *        SELECTED company + driver_company_authorizations — the same scope the DQF list uses). It must
 *        NOT gate "not found" on a bare `getDriver(id)` read, which scopes to the user's server-default
 *        company and 404s whenever the selected company differs → false "Driver not found".
 *
 *   D1 — the driver NAME in the DQF list is itself clickable → the driver's profile (entity-name click
 *        → its profile), not only the trailing "Open profile" action.
 *
 *   D3 — the driver profile header carries the module-header ← back + breadcrumb (design lock §8/§7).
 */
import { readFileSync } from "node:fs";

const failures = [];

const profilePath = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const tablePath = "apps/frontend/src/pages/drivers/DriversTable.tsx";
const headerPath = "apps/frontend/src/components/layout/PageHeader.tsx";

const profile = readFileSync(profilePath, "utf8");
const table = readFileSync(tablePath, "utf8");
const header = readFileSync(headerPath, "utf8");

// D2: driver identity sourced from the aggregate, not a bare getDriver() gate.
if (/\bgetDriver\s*\(/.test(profile)) {
  failures.push(
    `${profilePath}: must NOT call getDriver() — the "Driver not found" gate has to read the company-scoped aggregate (aggregate.driver), or a company mismatch resurfaces the D2 false "Driver not found".`
  );
}
if (!/aggregate\??\.driver/.test(profile)) {
  failures.push(`${profilePath}: driver identity must be derived from the aggregate (aggregate.driver) [D2].`);
}

// D3: profile header ships the module-header breadcrumb + a back affordance.
if (!/breadcrumb=\{/.test(profile)) {
  failures.push(`${profilePath}: PageHeader must receive a breadcrumb (module-header law) [D3].`);
}
if (!/onBack=\{/.test(profile) && !/backHref=/.test(profile)) {
  failures.push(`${profilePath}: PageHeader must receive onBack/backHref so the ← back arrow returns to the list [D3].`);
}
if (!/breadcrumb\b/.test(header) || !/onBack\b/.test(header)) {
  failures.push(`${headerPath}: PageHeader must support the breadcrumb + onBack props the profile depends on [D3].`);
}

// D1: the driver name cell is a clickable that opens the profile (both the embedded-callback and the
// routed-Link mounts), and the old plain non-clickable name cell is gone.
if (/>\s*\{row\.name\}\s*<\/td>/.test(table)) {
  failures.push(`${tablePath}: driver name must be clickable (opens the profile), not a plain <td> [D1].`);
}
const d1Routed =
  /\/drivers\/\$\{row\.driverId\}\/profile/.test(table) ||
  /kind="driver"[\s\S]{0,120}id=\{row\.driverId\}/.test(table);
if (!/onOpenProfile\(row\.driverId\)/.test(table) || !d1Routed) {
  failures.push(`${tablePath}: driver name must wire to onOpenProfile(row.driverId) and EntityLink kind=driver (or /drivers/:id/profile) [D1].`);
}
if (!/EntityLinkOrTombstone/.test(table)) {
  failures.push(`${tablePath}: routed driver hops must use EntityLinkOrTombstone so unresolved identities are not clickable.`);
}

if (failures.length > 0) {
  console.error("\n✗ verify-driver-profile-navigation: driver-profile navigation (D1/D2/D3) regressed.\n");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("✓ verify-driver-profile-navigation: name-click + aggregate-scoped profile + module-header back/breadcrumb intact.");
