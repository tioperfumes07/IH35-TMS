/**
 * LEAD 443.113 AJK-04 (real Postgres) — a same-name vendor must be LINKED to the driver (driver_id set) or the call must be
 * REFUSED with the vendor's name. On the old code every case below returned "already_present" and left driver_id NULL:
 * the caller counted a success while the driver still had no payee.
 * Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { DriverVendorIdentityUnresolvedError, ensureDriverVendor } from "../ensure-driver-vendor.shared.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("AJK-04 — ensureDriverVendor links a same-name vendor or refuses by name (real Postgres)", () => {
  it("links when unambiguous in an enforcing company; refuses (naming the vendor) otherwise", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = randomUUID().slice(0, 6);
    const actor = randomUUID();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(`INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en')`, [
        actor,
        `ajk04-${tag}@test.local`,
      ]);
      const company = async (enforce: boolean) =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO org.companies (code, legal_name, company_type, enforce_line_categorization)
             VALUES ($1, 'AJK-04 test', 'operating_carrier', $2) RETURNING id::text AS id`,
            [`AJK${enforce ? "E" : "F"}-${tag}`, enforce]
          )
        ).rows[0]!.id;
      let phone = 0;
      const driver = async (oc: string, first: string, last: string) =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
             VALUES ($1::uuid,$2,$3,$4,'Active') RETURNING id::text AS id`,
            [oc, first, last, `9561${tag.replace(/[^0-9]/g, "0").slice(0, 3)}${String(phone++).padStart(3, "0")}`]
          )
        ).rows[0]!.id;
      const vendor = async (oc: string, name: string, driverId: string | null) =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, driver_id)
             VALUES ($1::uuid,$2,'Other',$3::uuid) RETURNING id::text AS id`,
            [oc, name, driverId]
          )
        ).rows[0]!.id;
      const vendorDriver = async (vendorId: string) =>
        (await db.query<{ d: string | null }>(`SELECT driver_id::text AS d FROM mdata.vendors WHERE id = $1::uuid`, [vendorId])).rows[0]?.d ?? null;
      const ensure = (oc: string, driverId: string, displayName: string) =>
        ensureDriverVendor(db as never, { operatingCompanyId: oc, driverId, displayName, phone: null, email: null, actorUserId: actor });
      const refusal = async (p: Promise<unknown>) => {
        const err = await p.then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(DriverVendorIdentityUnresolvedError);
        return err as DriverVendorIdentityUnresolvedError;
      };

      const usmcaLike = await company(true);
      const frozen = await company(false);

      // 1. Unambiguous same-name vendor in an enforcing company -> LINKED, driver_id set.
      const ana = await driver(usmcaLike, "Ana", `Lopez${tag}`);
      const anaVendor = await vendor(usmcaLike, ` ana lopez${tag} `, null);
      expect(await ensure(usmcaLike, ana, `Ana Lopez${tag}`)).toBe("linked");
      expect(await vendorDriver(anaVendor)).toBe(ana);
      // ... and a second run is now "already_present" through the driver_id identity.
      expect(await ensure(usmcaLike, ana, `Ana Lopez${tag}`)).toBe("already_present");

      // 2. Same-name vendor already linked to ANOTHER driver -> refused, naming the vendor.
      const ben = await driver(usmcaLike, "Ben", `Ruiz${tag}`);
      const other = await driver(usmcaLike, "Carl", `Other${tag}`);
      const benVendor = await vendor(usmcaLike, `Ben Ruiz${tag}`, other);
      const e2 = await refusal(ensure(usmcaLike, ben, `Ben Ruiz${tag}`));
      expect(e2.reason).toBe("vendor_linked_to_another_driver");
      expect(e2.vendorName).toBe(`Ben Ruiz${tag}`);
      expect(await vendorDriver(benVendor)).toBe(other);

      // 3. Frozen QBO-mirror company (enforce_line_categorization false) -> refused, vendor left unlinked.
      const dan = await driver(frozen, "Dan", `Mirror${tag}`);
      const danVendor = await vendor(frozen, `Dan Mirror${tag}`, null);
      const e3 = await refusal(ensure(frozen, dan, `Dan Mirror${tag}`));
      expect(e3.reason).toBe("company_frozen_mirror");
      expect(e3.message).toContain(`Dan Mirror${tag}`);
      expect(await vendorDriver(danVendor)).toBeNull();

      // 4. Two active drivers share the name -> refused (which one is the payee is the operator's call).
      const eva1 = await driver(usmcaLike, "Eva", `Twin${tag}`);
      await driver(usmcaLike, "Eva", `Twin${tag}`);
      const evaVendor = await vendor(usmcaLike, `Eva Twin${tag}`, null);
      const e4 = await refusal(ensure(usmcaLike, eva1, `Eva Twin${tag}`));
      expect(e4.reason).toBe("ambiguous_same_name_drivers");
      expect(await vendorDriver(evaVendor)).toBeNull();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
