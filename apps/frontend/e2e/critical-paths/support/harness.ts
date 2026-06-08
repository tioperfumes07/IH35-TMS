import { expect, type Page, type Route } from "@playwright/test";

export const E2E_COMPANY_ID = "comp-e2e-001";

type OfficeRole =
  | "Owner"
  | "Administrator"
  | "Manager"
  | "Accountant"
  | "Dispatcher"
  | "Safety"
  | "Driver"
  | "Mechanic";

type MockOptions = {
  role?: OfficeRole;
  userName?: string;
  userEmail?: string;
};

type MockUserRow = {
  id: string;
  name: string;
  email: string;
  role: OfficeRole;
  auth_method: string;
  created_at: string;
  deactivated_at: string | null;
  last_login_at: string | null;
};

type MockState = {
  users: MockUserRow[];
  fuelUploads: string[];
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultUsers(): MockUserRow[] {
  return [
    {
      id: "user-owner-1",
      name: "Operations Owner",
      email: "owner@ih35.test",
      role: "Owner",
      auth_method: "email_password",
      created_at: nowIso(),
      deactivated_at: null,
      last_login_at: nowIso(),
    },
    {
      id: "user-driver-1",
      name: "Driver One",
      email: "driver.one@ih35.test",
      role: "Driver",
      auth_method: "phone",
      created_at: nowIso(),
      deactivated_at: null,
      last_login_at: nowIso(),
    },
  ];
}

export async function installCriticalPathMocks(page: Page, options: MockOptions = {}) {
  const role = options.role ?? "Owner";
  const userName = options.userName ?? "Critical Path User";
  const userEmail = options.userEmail ?? "critical.path@ih35.test";

  const state: MockState = {
    users: createDefaultUsers(),
    fuelUploads: [],
  };

  const settlementListRow = {
    id: "set-001",
    driver_id: "driver-001",
    driver_full_name: "Driver One",
    driver_display_id: "DRV-001",
    period_start: "2026-06-01",
    period_end: "2026-06-07",
    gross_pay: 420000,
    deductions_total: 82000,
    net_pay: 338000,
    status: "draft",
    live_debt_flag: 0,
    has_pending_acks: false,
    payment_state: "unpaid",
  };

  const settlementDetail = {
    id: "set-001",
    driver_id: "driver-001",
    driver_full_name: "Driver One",
    driver_display_id: "DRV-001",
    period_start: "2026-06-01",
    period_end: "2026-06-07",
    status: "draft",
    payment_state: "unpaid",
    has_pending_acks: false,
    lines: [
      {
        id: "line-earn-1",
        line_type: "earnings",
        description: "Loaded miles",
        miles: 1100,
        rate: 1.9,
        amount: 209000,
      },
      {
        id: "line-ded-1",
        line_type: "deduction",
        description: "Fuel advance",
        amount: 30000,
        balance_left: 30000,
        is_held: false,
        pending_ack: false,
      },
    ],
  };

  const paymentEvents: Array<{ id: string; event_type: string; created_at: string }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.startsWith("/api/v1/accounting/profit-loss/export/")) {
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="profit-loss.pdf"',
        },
        body: "%PDF-1.4\n% mocked export\n",
      });
    }

    if (path === "/api/v1/auth/me") {
      return json(route, {
        user: {
          id: "office-user-001",
          name: userName,
          email: userEmail,
          role,
        },
        session: { id: "sess-office-001" },
      });
    }

    if (path === "/api/v1/org/me/companies") {
      return json(route, {
        companies: [
          {
            id: E2E_COMPANY_ID,
            code: "IH35",
            legal_name: "IH35 Demo Carrier LLC",
            short_name: "IH35 Demo",
            is_default: true,
          },
        ],
      });
    }

    if (path === "/api/v1/mdata/customers") {
      return json(route, {
        customers: [
          {
            id: "cust-001",
            name: "Acme Freight",
            customer_code: "ACME",
          },
        ],
      });
    }

    if (path === "/api/v1/mdata/drivers") {
      return json(route, {
        drivers: [
          {
            id: "driver-001",
            first_name: "Driver",
            last_name: "One",
            phone: "+15550001111",
            status: "Active",
          },
        ],
      });
    }

    if (path === "/api/v1/loads") {
      return json(route, {
        loads: [
          {
            id: "load-001",
            load_number: "L-000001",
            customer_name: "Acme Freight",
            first_pickup_city: "Dallas",
            first_delivery_city: "San Antonio",
            assigned_primary_driver_name: "Driver One",
            rate_total_cents: 150000,
            status: "booked",
          },
        ],
        total_count: 1,
      });
    }

    if (path === "/api/v1/safety/geofence-breaches") {
      return json(route, { events: [] });
    }

    if (path === "/api/v1/dispatch/loads" && method === "POST") {
      return json(route, {
        id: "load-002",
        load_number: "L-000002",
        status: "booked",
      });
    }

    if (path === "/api/v1/accounting/invoices") {
      return json(route, {
        invoices: [
          {
            id: "inv-001",
            display_id: "INV-2026-0001",
            customer_name: "Acme Freight",
            issue_date: "2026-06-08",
            due_date: "2026-06-18",
            status: "draft",
            source_load_chargeback_requested: false,
            total_cents: 122500,
            amount_open_cents: 122500,
            factoring_advance_id: null,
          },
        ],
      });
    }

    if (path === "/api/v1/accounting/payments") {
      if (method === "POST") {
        return json(route, {
          id: "pay-002",
          display_id: "PAY-0002",
          customer_name: "Acme Freight",
          payment_date: "2026-06-08",
          payment_method: "ach",
          reference: "ACH-901",
          amount_cents: 122500,
          amount_applied_cents: 122500,
          amount_unapplied_cents: 0,
          voided_at: null,
          applications: [],
        });
      }
      return json(route, {
        rows: [
          {
            id: "pay-001",
            display_id: "PAY-0001",
            customer_name: "Acme Freight",
            payment_date: "2026-06-08",
            payment_method: "ach",
            reference: "ACH-900",
            amount_cents: 50000,
            amount_applied_cents: 50000,
            amount_unapplied_cents: 0,
            voided_at: null,
          },
        ],
        total: 1,
      });
    }

    if (path === "/api/v1/accounting/bills") {
      return json(route, {
        rows: [
          {
            id: "bill-001",
            vendor_id: "ven-001",
            vendor_name: "Roadside Vendor",
            bill_number: "BILL-1001",
            bill_date: "2026-06-05",
            due_date: "2026-06-20",
            amount_cents: 98000,
            paid_cents: 12000,
            balance_cents: 86000,
            status: "open",
            memo: "repair invoice",
          },
        ],
      });
    }

    if (path === "/api/v1/accounting/bill-payments") {
      return json(route, {
        rows: [
          {
            id: "bp-001",
            bill_id: "bill-001",
            vendor_id: "ven-001",
            amount_cents: 12000,
            payment_date: "2026-06-06",
            payment_method: "ach",
            memo: "scheduled payment",
            reference_number: "ACH-88",
          },
        ],
      });
    }

    if (path === "/api/v1/accounting/bills/bill-001/payments") {
      return json(route, {
        payments: [
          {
            id: "bp-001",
            bill_id: "bill-001",
            vendor_id: "ven-001",
            amount_cents: 12000,
            payment_date: "2026-06-06",
            payment_method: "ach",
            memo: "scheduled payment",
            reference_number: "ACH-88",
          },
        ],
      });
    }

    if (path.startsWith("/api/v1/accounting/bills/") && path.endsWith("/pay") && method === "POST") {
      return json(route, {
        payment: {
          id: "bp-002",
          bill_id: "bill-001",
          amount_cents: 86000,
          payment_method: "check",
          payment_date: "2026-06-08",
        },
      });
    }

    if (path.includes("/bulk-update") && method === "POST") {
      const ids = ["inv-001"];
      return json(route, {
        requested: ids.length,
        succeeded: ids,
        failed: [],
        audit_log_ids: [],
        bulk_call_id: "bulk-001",
      });
    }

    if (path === "/api/v1/driver-finance/settlements") {
      return json(route, { settlements: [settlementListRow], total_count: 1 });
    }

    if (path === "/api/v1/driver-finance/settlements/set-001") {
      return json(route, settlementDetail);
    }

    if (path === "/api/v1/driver-finance/settlements/set-001/acknowledge" && method === "PATCH") {
      return json(route, { ok: true });
    }

    if (path === "/api/v1/driver-finance/settlements/set-001/finalize" && method === "PATCH") {
      settlementDetail.status = "locked";
      settlementListRow.status = "locked";
      paymentEvents.push({ id: `evt-${paymentEvents.length + 1}`, event_type: "finalized", created_at: nowIso() });
      return json(route, settlementDetail);
    }

    if (path === "/api/v1/driver-pay/settlements/set-001/payment-events") {
      return json(route, { events: paymentEvents });
    }

    if (path === "/api/v1/driver-pay/settlements/set-001/queue-payment" && method === "POST") {
      settlementDetail.payment_state = "queued";
      settlementListRow.payment_state = "queued";
      paymentEvents.push({ id: `evt-${paymentEvents.length + 1}`, event_type: "queued", created_at: nowIso() });
      return json(route, { settlement: settlementDetail });
    }

    if (path === "/api/v1/driver-pay/settlements/set-001/mark-sent" && method === "POST") {
      settlementDetail.payment_state = "sent_to_bank";
      settlementListRow.payment_state = "sent_to_bank";
      paymentEvents.push({ id: `evt-${paymentEvents.length + 1}`, event_type: "sent_to_bank", created_at: nowIso() });
      return json(route, { settlement: settlementDetail });
    }

    if (path === "/api/v1/driver-pay/settlements/set-001/mark-cleared" && method === "POST") {
      settlementDetail.payment_state = "cleared";
      settlementDetail.status = "paid";
      settlementListRow.payment_state = "cleared";
      settlementListRow.status = "paid";
      paymentEvents.push({ id: `evt-${paymentEvents.length + 1}`, event_type: "cleared", created_at: nowIso() });
      return json(route, { settlement: settlementDetail });
    }

    if (path.startsWith("/api/v1/driver-finance/drivers/") && path.endsWith("/debt-summary")) {
      return json(route, {
        total_active_debt: 0,
        pending_ack_count: 0,
        pending_ack_total: 0,
        escrow_pre_clause: 0,
        escrow_post_clause: 0,
        source_liabilities: [],
      });
    }

    if (path.startsWith("/api/v1/driver-finance/drivers/") && path.endsWith("/escrow-timeline")) {
      return json(route, { timeline: [] });
    }

    if (path === "/api/v1/banking/dashboard/kpis") {
      return json(route, {
        total_cash: 350000,
        dip_operating: 50000,
        dip_payroll: 12000,
        total_uncategorized: 3,
        factoring_reserve: 22000,
        driver_escrow: 8000,
        drivers_with_escrow_balance: 2,
      });
    }

    if (path === "/api/v1/banking/account-tiles") {
      return json(route, {
        tiles: [
          {
            id: "tile-1",
            operating_company_id: E2E_COMPANY_ID,
            display_name: "Operating Checking",
            account_type: "bank",
            tag: "operating",
            tile_kind: "real",
            current_balance: 128900.55,
            uncategorized_count: 2,
            color_tag: "blue",
            is_relay: false,
            display_order: 1,
            last_txn_date: "2026-06-08",
          },
        ],
      });
    }

    if (path === "/api/v1/banking/accounts/all") {
      return json(route, {
        accounts: [
          { id: "bank-1", display_name: "Operating Checking", account_type: "bank", visible: true, tag: "operating", is_dip: false },
        ],
      });
    }

    if (path === "/api/v1/banking/plaid/accounts") {
      return json(route, {
        accounts: [
          {
            id: "bank-1",
            operating_company_id: E2E_COMPANY_ID,
            institution_name: "Demo Bank",
            account_name: "Checking",
            account_type: "depository",
            account_mask: "1234",
            current_balance_cents: 12890055,
            available_balance_cents: 12890055,
            currency_code: "USD",
            sync_status: "active",
            is_active: true,
            last_synced_at: nowIso(),
          },
        ],
      });
    }

    if (path === "/api/v1/banking/reconciliation/sessions") {
      return json(route, { open_sessions: [], completed_sessions: [] });
    }

    if (path === "/api/v1/banking/transactions/uncategorized") {
      return json(route, {
        rows: [
          {
            id: "txn-uncat-1",
            amount_cents: 12345,
            transaction_date: "2026-06-08",
            description: "Fuel stop",
          },
        ],
      });
    }

    if (path === "/api/v1/banking/reconcile/unmatched-transactions") {
      return json(route, {
        transactions: [
          {
            id: "bank-txn-1",
            bank_account_id: "bank-1",
            transaction_date: "2026-06-08",
            posted_date: "2026-06-08",
            amount_cents: 25500,
            description: "Diesel purchase",
            merchant_name: "Fuel Plaza",
            plaid_category: ["Transportation", "Fuel"],
            pending: false,
            is_credit: false,
            matched_load_id: null,
            matched_bill_id: null,
            matched_settlement_id: null,
            reconciled_obligation_type: null,
            reconciled_obligation_id: null,
            reviewed_at: null,
            status: null,
            category: null,
          },
        ],
      });
    }

    if (path === "/api/v1/banking/reconcile/obligations") {
      return json(route, {
        obligations: [
          {
            obligation_type: "bill",
            obligation_id: "bill-001",
            label: "Roadside Vendor BILL-1001",
            amount_cents: 25500,
            event_date: "2026-06-08",
          },
        ],
      });
    }

    if (path === "/api/v1/banking/reconcile/suggestions") {
      return json(route, {
        suggestions: [
          {
            obligation_type: "bill",
            obligation_id: "bill-001",
            label: "Roadside Vendor BILL-1001",
            amount_cents: 25500,
            event_date: "2026-06-08",
            confidence: 0.96,
            lev: 1,
          },
        ],
      });
    }

    if (path === "/api/v1/banking/reconcile" && method === "POST") {
      return json(route, { ok: true });
    }

    if (path === "/api/v1/banking/reconcile/bulk" && method === "POST") {
      return json(route, { ok: true, updated_count: 1 });
    }

    if (path === "/api/v1/accounting/profit-loss") {
      return json(route, {
        revenue: {
          lines: [{ account_code: "4000", account_name: "Linehaul Revenue", account_type: "income", amount: 250000 }],
          total: 250000,
        },
        cogs: {
          lines: [{ account_code: "5000", account_name: "Fuel Expense", account_type: "cogs", amount: 90000 }],
          total: 90000,
        },
        gross_profit: 160000,
        operating_expenses: {
          lines: [{ account_code: "6100", account_name: "Dispatch Ops", account_type: "expense", amount: 30000 }],
          total: 30000,
        },
        net_income: 130000,
        basis: "accrual",
      });
    }

    if (path === "/api/v1/auth/phone/start" && method === "POST") {
      return json(route, { ok: true });
    }

    if (path === "/api/v1/auth/phone/verify" && method === "POST") {
      return json(route, {
        ok: true,
        user: { role: "Driver" },
        driver_auth: {
          access_token: "driver-access-token",
          refresh_token: "driver-refresh-token",
          expires_in: 3600,
        },
      });
    }

    if (path === "/api/v1/driver/me") {
      return json(route, {
        driver: { id: "driver-001", full_name: "Driver One", status: "active", preferred_language: "en" },
        operating_company_id: E2E_COMPANY_ID,
        identity_user_id: "user-driver-1",
        onboarding_completed_at: nowIso(),
      });
    }

    if (path === "/api/v1/driver/loads") {
      return json(route, []);
    }

    if (path === "/api/v1/driver/fuel/upload-receipt" && method === "POST") {
      const id = `fuel-receipt-${state.fuelUploads.length + 1}`;
      state.fuelUploads.push(id);
      return json(route, { bank_transaction_id: id });
    }

    if (path === "/api/v1/identity/users") {
      if (method === "POST") {
        const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        const nextUser: MockUserRow = {
          id: `user-${state.users.length + 1}`,
          name: String(payload.name ?? "Invited User"),
          email: String(payload.email ?? `invited-${state.users.length + 1}@ih35.test`),
          role: (String(payload.role ?? "Manager") as OfficeRole),
          auth_method: "invite_pending",
          created_at: nowIso(),
          deactivated_at: null,
          last_login_at: null,
        };
        state.users.unshift(nextUser);
        return json(route, nextUser, 201);
      }
      return json(route, { users: state.users });
    }

    if (path === "/api/v1/identity/workflow-requests" && method === "POST") {
      return json(route, { id: "wf-001", status: "pending" }, 201);
    }

    if (path === "/api/v1/identity/users/check-returning-dispatcher" && method === "POST") {
      return json(route, {
        returning_dispatcher: false,
        matched_events: [],
        severity_summary: { severe_count: 0, warning_count: 0, info_count: 0 },
      });
    }

    if (path === "/api/v1/auth/office/email-login" && method === "POST") {
      return json(route, {
        ok: true,
        user: { id: "office-user-001", email: userEmail, role },
        session: { id: "sess-office-001" },
      });
    }

    if (path === "/api/integrations/samsara/positions/active-loads") {
      return json(route, {
        positions: [
          { load_uuid: "load-001", lat: 29.4241, lng: -98.4936, speed_mph: 61, stale: false },
        ],
      });
    }

    if (method === "GET") {
      return json(route, {});
    }
    return json(route, { ok: true });
  });

  return { state };
}

export async function goTo(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
