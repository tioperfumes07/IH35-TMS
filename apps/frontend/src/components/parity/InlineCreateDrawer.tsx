/**
 * BK7 — InlineCreateDrawer
 *
 * Stackable ~576px right-drawer for inline entity creation. Replaces modal for
 * richer create flows (New Account, New Service, New Vendor/Customer). Opens on
 * top of parent without closing it; returns the new id to the caller. Shell =
 * ParityDrawer (A3), the shared ~576px create/edit drawer used across the app.
 *
 * Gate split:
 *   - Service, Vendor, Customer creates → OPERATIONAL (live).
 *   - Account create commit → FINANCIAL/GATED: UI renders but submit is blocked
 *     pending Jorge's per-block OK (per financial-cluster policy).
 *
 * "class" intentionally NOT wired here: NewClassDrawerForm.tsx currently posts
 * through createQboAccount (account_type: "Class"), which writes mdata.qbo_accounts
 * AND enqueues a real QuickBooks Online push (entity: "account") — i.e. it would
 * push a fabricated "account" into the live QBO chart of accounts. That is a
 * financial-cluster / external-financial-system write and must not ship without
 * a real class-catalog endpoint + Jorge's explicit OK. See NewClassDrawerForm.tsx
 * header comment — left unwired on purpose (HELD, do not add a "class" case here
 * until the backend has a dedicated, non-account class-create endpoint).
 */
import { NewAccountDrawerForm } from "./drawers/NewAccountDrawerForm";
import { NewServiceDrawerForm } from "./drawers/NewServiceDrawerForm";
import { NewVendorDrawerForm } from "./drawers/NewVendorDrawerForm";
import { NewCustomerDrawerForm } from "./drawers/NewCustomerDrawerForm";
import { ParityDrawer } from "./ParityDrawer";

export type InlineCreateKind =
  | "account"
  | "service"
  | "vendor"
  | "customer";

export type InlineCreateResult = { id: string; label: string };

type Props = {
  open: boolean;
  kind: InlineCreateKind;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (result: InlineCreateResult) => void;
};

const TITLES: Record<InlineCreateKind, string> = {
  account: "New account",
  service: "New product/service",
  vendor: "New vendor",
  customer: "New customer",
};

export function InlineCreateDrawer({ open, kind, operatingCompanyId, onClose, onCreated }: Props) {
  return (
    <ParityDrawer open={open} title={TITLES[kind]} onClose={onClose} stackAboveModal>
      <div data-testid={`inline-create-drawer-${kind}`}>
        {kind === "account" && (
          <NewAccountDrawerForm
            operatingCompanyId={operatingCompanyId}
            onCreated={onCreated}
            onClose={onClose}
          />
        )}
        {kind === "service" && (
          <NewServiceDrawerForm
            operatingCompanyId={operatingCompanyId}
            onCreated={onCreated}
            onClose={onClose}
          />
        )}
        {kind === "vendor" && (
          <NewVendorDrawerForm
            operatingCompanyId={operatingCompanyId}
            onCreated={onCreated}
            onClose={onClose}
          />
        )}
        {kind === "customer" && (
          <NewCustomerDrawerForm
            operatingCompanyId={operatingCompanyId}
            onCreated={onCreated}
            onClose={onClose}
          />
        )}
      </div>
    </ParityDrawer>
  );
}
