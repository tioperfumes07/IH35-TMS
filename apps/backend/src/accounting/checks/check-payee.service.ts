// R-154.1 §A — payee resolution for the check engine.
//
// A check's EntityRef is one of vendor / driver / customer / employee (QBO parity, spec §1/§A).
// This is the ONE place that resolves a (payee_kind, payee_id) pair into what a check actually
// needs: the name printed on the check face, and (where the table carries one) a remit-to address
// snapshot. Every payee table uses the same void-not-delete shape (deactivated_at) -- a deactivated
// payee is refused, not silently allowed.
//
// mdata.drivers carries no clean US-style mailing address (only mx_address_* for the driver's
// Mexico-side address, per this fleet's B1 driver population) -- remit_to_address is null for a
// driver payee by honest necessity, not an oversight; the check still prints the driver's name.
// identity.users (employee) likewise carries no mailing address in this schema.

import { withLuciaBypass } from "../../auth/db.js";

export type CheckPayeeKind = "vendor" | "driver" | "customer" | "employee";
export const CHECK_PAYEE_KIND_VALUES: readonly CheckPayeeKind[] = ["vendor", "driver", "customer", "employee"];

export type CheckPayeeErrorCode = "PAYEE_KIND_INVALID" | "PAYEE_NOT_FOUND";

export class CheckPayeeError extends Error {
  code: CheckPayeeErrorCode;
  constructor(code: CheckPayeeErrorCode, message: string) {
    super(message);
    this.name = "CheckPayeeError";
    this.code = code;
  }
}

export type RemitToAddress = {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export type ResolvedCheckPayee = {
  payee_kind: CheckPayeeKind;
  payee_id: string;
  print_on_check_name: string;
  remit_to_address: RemitToAddress | null;
  /** Only meaningful for payee_kind === "vendor". */
  eligible_1099: boolean | null;
  /** payee_kind === "vendor" and the vendor is itself a driver-as-vendor row. */
  vendor_driver_id: string | null;
};

function nonEmpty(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

async function resolveVendorPayee(operating_company_id: string, payee_id: string): Promise<ResolvedCheckPayee> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const res = await client.query<{
      vendor_name: string;
      print_on_check_name: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      country: string | null;
      eligible_1099: boolean | null;
      driver_id: string | null;
    }>(
      `SELECT vendor_name, print_on_check_name, address_line1, address_line2, city, state, postal_code, country,
              eligible_1099, driver_id
         FROM mdata.vendors
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [payee_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) throw new CheckPayeeError("PAYEE_NOT_FOUND", "Vendor not found, or deactivated, in this company.");
    return {
      payee_kind: "vendor",
      payee_id,
      print_on_check_name: row.print_on_check_name?.trim() || row.vendor_name,
      remit_to_address: {
        address_line1: row.address_line1,
        address_line2: row.address_line2,
        city: row.city,
        state: row.state,
        postal_code: row.postal_code,
        country: row.country,
      },
      eligible_1099: row.eligible_1099,
      vendor_driver_id: row.driver_id,
    };
  });
}

async function resolveDriverPayee(operating_company_id: string, payee_id: string): Promise<ResolvedCheckPayee> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const res = await client.query<{ first_name: string | null; last_name: string | null }>(
      `SELECT first_name, last_name
         FROM mdata.drivers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [payee_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) throw new CheckPayeeError("PAYEE_NOT_FOUND", "Driver not found, or deactivated, in this company.");
    const name = nonEmpty(row.first_name, row.last_name);
    return {
      payee_kind: "driver",
      payee_id,
      print_on_check_name: name || "Driver",
      remit_to_address: null,
      eligible_1099: null,
      vendor_driver_id: null,
    };
  });
}

async function resolveCustomerPayee(operating_company_id: string, payee_id: string): Promise<ResolvedCheckPayee> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const res = await client.query<{
      customer_name: string;
      print_on_invoice_name: string | null;
      billing_address_line1: string | null;
      billing_address_line2: string | null;
      billing_city: string | null;
      billing_state: string | null;
      billing_postal_code: string | null;
      billing_country: string | null;
    }>(
      `SELECT customer_name, print_on_invoice_name, billing_address_line1, billing_address_line2,
              billing_city, billing_state, billing_postal_code, billing_country
         FROM mdata.customers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [payee_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) throw new CheckPayeeError("PAYEE_NOT_FOUND", "Customer not found, or deactivated, in this company.");
    return {
      payee_kind: "customer",
      payee_id,
      // No print_on_check_name column on mdata.customers -- print_on_invoice_name is the closest
      // existing "how this party's name should print" field for this entity.
      print_on_check_name: row.print_on_invoice_name?.trim() || row.customer_name,
      remit_to_address: {
        address_line1: row.billing_address_line1,
        address_line2: row.billing_address_line2,
        city: row.billing_city,
        state: row.billing_state,
        postal_code: row.billing_postal_code,
        country: row.billing_country,
      },
      eligible_1099: null,
      vendor_driver_id: null,
    };
  });
}

async function resolveEmployeePayee(operating_company_id: string, payee_id: string): Promise<ResolvedCheckPayee> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ first_name: string | null; last_name: string | null }>(
      `SELECT first_name, last_name
         FROM identity.users
        WHERE id = $1::uuid AND default_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [payee_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) {
      throw new CheckPayeeError(
        "PAYEE_NOT_FOUND",
        "Employee not found, or deactivated, for this company (matched on default_company_id -- a user " +
          "whose default company differs but who holds access via org.user_company_access is not resolvable " +
          "as a check payee yet)."
      );
    }
    const name = nonEmpty(row.first_name, row.last_name);
    return {
      payee_kind: "employee",
      payee_id,
      print_on_check_name: name || "Employee",
      remit_to_address: null,
      eligible_1099: null,
      vendor_driver_id: null,
    };
  });
}

export async function resolveCheckPayee(
  operating_company_id: string,
  payee_kind: string,
  payee_id: string
): Promise<ResolvedCheckPayee> {
  switch (payee_kind as CheckPayeeKind) {
    case "vendor":
      return resolveVendorPayee(operating_company_id, payee_id);
    case "driver":
      return resolveDriverPayee(operating_company_id, payee_id);
    case "customer":
      return resolveCustomerPayee(operating_company_id, payee_id);
    case "employee":
      return resolveEmployeePayee(operating_company_id, payee_id);
    default:
      throw new CheckPayeeError(
        "PAYEE_KIND_INVALID",
        `payee_kind "${payee_kind}" is not one of vendor/driver/customer/employee.`
      );
  }
}
