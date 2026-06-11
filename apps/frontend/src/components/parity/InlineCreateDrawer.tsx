/**
 * BK7 — InlineCreateDrawer
 *
 * Stackable ~576px right-drawer for inline entity creation. Replaces modal for
 * richer create flows (New Account, New Class, New Service, New Vendor/Customer).
 * Opens on top of parent without closing it; returns the new id to the caller.
 *
 * Gate split:
 *   - Class, Service, Vendor, Customer creates → OPERATIONAL (live).
 *   - Account create commit → FINANCIAL/GATED: UI renders but submit is blocked
 *     pending Jorge's per-block OK (per financial-cluster policy).
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { NewAccountDrawerForm } from "./drawers/NewAccountDrawerForm";
import { NewClassDrawerForm } from "./drawers/NewClassDrawerForm";
import { NewServiceDrawerForm } from "./drawers/NewServiceDrawerForm";
import { NewVendorDrawerForm } from "./drawers/NewVendorDrawerForm";
import { NewCustomerDrawerForm } from "./drawers/NewCustomerDrawerForm";

export type InlineCreateKind =
  | "account"
  | "class"
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
  class: "New class",
  service: "New product/service",
  vendor: "New vendor",
  customer: "New customer",
};

export function InlineCreateDrawer({ open, kind, operatingCompanyId, onClose, onCreated }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — semi-transparent so parent is still visible (stackable UX) */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel — ~576px, right-anchored */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[kind]}
        data-testid={`inline-create-drawer-${kind}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[576px] flex-col bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">{TITLES[kind]}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {kind === "account" && (
            <NewAccountDrawerForm
              operatingCompanyId={operatingCompanyId}
              onCreated={onCreated}
              onClose={onClose}
            />
          )}
          {kind === "class" && (
            <NewClassDrawerForm
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
      </div>
    </>
  );
}
