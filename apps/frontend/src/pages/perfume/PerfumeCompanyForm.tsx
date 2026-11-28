/**
 * PERFUME — the ONE company form (owner 2026-11-28 14:58 CT: "all boxes, catalogs, must be drop down filter … in relationship I might
 * want to select multiple, business type also … the boxes are supposed to be designed and sized accordingly, the state and zip cannot be
 * the same size as all address and country … you only have 1 contact … create adequate and professional profile creators").
 * Used by "+ Create vendor / customer" and by "Edit company", so both look and behave the same (QuickBooks "New customer" layout):
 *   · Company — name (full width); Relationship, Business type, Industry, Review tags as multi-select drop-down filters (type to search);
 *   · Phone (narrow) · Website (wide);
 *   · Address — street (full width), then City (wide) · State (narrow) · ZIP (narrow) · Country (medium) on one row;
 *   · Notes (full width).
 * Contacts (several people) are a separate block: ContactsFields.
 */
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ctl } from "./perfumeDocParts";

export type CompanyFormValues = {
  phone: string; website: string; address: string; city: string; state: string; zip: string; country: string; notes: string;
  relationships: string[]; business_types: string[]; categories: string[]; review_tags: string[];
};
export const EMPTY_COMPANY_FORM: CompanyFormValues = { phone: "", website: "", address: "", city: "", state: "", zip: "", country: "", notes: "",
  relationships: [], business_types: [], categories: [], review_tags: [] };

export type ContactRow = { name: string; title: string; email: string; phone: string };
export const EMPTY_CONTACT: ContactRow = { name: "", title: "", email: "", phone: "" };

/** The drop-downs fill their column like every other box of the form (the shared trigger is min-width only). */
const MS_TRIGGER = "flex h-[34px] w-full items-center justify-between gap-1 rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs text-gray-900 hover:bg-gray-50";
const opts = (all: string[], cur: string[]) => [...new Set([...all, ...cur])].map((x) => ({ value: x, label: x }));

function Field({ label, span, children }: { label: string; span: string; children: React.ReactNode }) {
  return <label className={`block text-xs ${span}`}><span className="text-[#334155]">{label}</span><div className="mt-0.5">{children}</div></label>;
}

/** The catalog lists come from the Catalogs tab (perfume.catalog_values): category = Relationship, segment = Business type. */
export function CompanyFields({ v, set, lists, showTags = true, testPrefix }: {
  v: CompanyFormValues; set: (next: CompanyFormValues) => void;
  lists: { category: string[]; segment: string[]; industry: string[]; review_tag: string[] }; showTags?: boolean; testPrefix: string;
}) {
  const text = (k: "phone" | "website" | "address" | "city" | "state" | "zip" | "country", maxLength: number, extra?: { autoComplete?: string; inputMode?: "tel" | "url" | "text" }) => (
    <input className={`${ctl} w-full`} value={v[k]} maxLength={maxLength} onChange={(e) => set({ ...v, [k]: e.target.value })}
      autoComplete={extra?.autoComplete} inputMode={extra?.inputMode} aria-label={k} data-testid={`${testPrefix}-${k}`} />
  );
  return (
    <div className="space-y-3" data-testid={`${testPrefix}-company-fields`}>
      <div className="grid grid-cols-12 gap-2">
        <Field label="Relationship (several)" span="col-span-12 md:col-span-6">
          <MultiSelectDropdown className="w-full" triggerClassName={MS_TRIGGER} label="Relationship" allLabel="None" options={opts(lists.category, v.relationships)} selected={v.relationships}
            onChange={(x) => set({ ...v, relationships: x })} data-testid={`${testPrefix}-relationships`} />
        </Field>
        <Field label="Business type (several)" span="col-span-12 md:col-span-6">
          <MultiSelectDropdown className="w-full" triggerClassName={MS_TRIGGER} label="Business type" allLabel="None" options={opts(lists.segment, v.business_types)} selected={v.business_types}
            onChange={(x) => set({ ...v, business_types: x })} data-testid={`${testPrefix}-business-types`} />
        </Field>
        <Field label="Industry" span={showTags ? "col-span-12 md:col-span-6" : "col-span-12"}>
          <MultiSelectDropdown className="w-full" triggerClassName={MS_TRIGGER} label="Industry" allLabel="None" options={opts(lists.industry, v.categories)} selected={v.categories}
            onChange={(x) => set({ ...v, categories: x })} data-testid={`${testPrefix}-industry`} />
        </Field>
        {showTags ? (
          <Field label="Review tags" span="col-span-12 md:col-span-6">
            <MultiSelectDropdown className="w-full" triggerClassName={MS_TRIGGER} label="Review tags" allLabel="None" options={opts(lists.review_tag, v.review_tags)} selected={v.review_tags}
              onChange={(x) => set({ ...v, review_tags: x })} data-testid={`${testPrefix}-tags`} />
          </Field>
        ) : null}
      </div>
      <div className="grid grid-cols-12 gap-2">
        <Field label="Main phone" span="col-span-12 md:col-span-4">{text("phone", 60, { autoComplete: "tel", inputMode: "tel" })}</Field>
        <Field label="Website" span="col-span-12 md:col-span-8">{text("website", 300, { inputMode: "url" })}</Field>
      </div>
      <div className="text-card-title">Address</div>
      <div className="grid grid-cols-12 gap-2" data-testid={`${testPrefix}-address-grid`}>
        <Field label="Street address" span="col-span-12">{text("address", 300, { autoComplete: "street-address" })}</Field>
        <Field label="City" span="col-span-12 md:col-span-5">{text("city", 120, { autoComplete: "address-level2" })}</Field>
        <Field label="State" span="col-span-4 md:col-span-2">{text("state", 40, { autoComplete: "address-level1" })}</Field>
        <Field label="ZIP" span="col-span-4 md:col-span-2">{text("zip", 20, { autoComplete: "postal-code" })}</Field>
        <Field label="Country" span="col-span-4 md:col-span-3">{text("country", 60, { autoComplete: "country-name" })}</Field>
      </div>
      <Field label="Notes" span="block">
        <textarea className={`${ctl} min-h-[64px] w-full py-1`} value={v.notes} maxLength={5000} onChange={(e) => set({ ...v, notes: e.target.value })} aria-label="Notes" data-testid={`${testPrefix}-notes`} />
      </Field>
    </div>
  );
}

/** Several contact people on one company — one row each (name · title · email · phone), add another / remove. */
export function ContactsFields({ rows, set, testPrefix }: { rows: ContactRow[]; set: (next: ContactRow[]) => void; testPrefix: string }) {
  const upd = (i: number, k: keyof ContactRow, val: string) => set(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <div className="space-y-2" data-testid={`${testPrefix}-contacts`}>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-[3px] border border-[#E5E7EB] p-2" data-testid={`${testPrefix}-contact-${i}`}>
          <Field label="Name" span="col-span-12 md:col-span-3"><input className={`${ctl} w-full`} value={r.name} onChange={(e) => upd(i, "name", e.target.value)} aria-label={`Contact ${i + 1} name`} data-testid={`${testPrefix}-contact-${i}-name`} /></Field>
          <Field label="Title" span="col-span-6 md:col-span-2"><input className={`${ctl} w-full`} value={r.title} onChange={(e) => upd(i, "title", e.target.value)} aria-label={`Contact ${i + 1} title`} data-testid={`${testPrefix}-contact-${i}-title`} /></Field>
          <Field label="Email" span="col-span-6 md:col-span-4"><input type="email" className={`${ctl} w-full`} value={r.email} onChange={(e) => upd(i, "email", e.target.value)} aria-label={`Contact ${i + 1} email`} data-testid={`${testPrefix}-contact-${i}-email`} /></Field>
          <Field label="Phone" span="col-span-10 md:col-span-2"><input className={`${ctl} w-full`} inputMode="tel" value={r.phone} onChange={(e) => upd(i, "phone", e.target.value)} aria-label={`Contact ${i + 1} phone`} data-testid={`${testPrefix}-contact-${i}-phone`} /></Field>
          <div className="col-span-2 md:col-span-1">
            <button type="button" className="h-[30px] w-full rounded-sm border border-[#C6D1DC] bg-[var(--surface-unselected)] text-xs hover:bg-[var(--surface-hover)]" aria-label={`Remove contact ${i + 1}`}
              onClick={() => set(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...EMPTY_CONTACT }])} data-testid={`${testPrefix}-contact-${i}-remove`}>×</button>
          </div>
        </div>
      ))}
      <button type="button" className="h-[30px] rounded-sm border border-[#C6D1DC] bg-[var(--surface-unselected)] px-3 text-xs font-semibold text-[#14314F] hover:bg-[var(--surface-hover)]"
        onClick={() => set([...rows, { ...EMPTY_CONTACT }])} data-testid={`${testPrefix}-contact-add`}>+ Add another contact</button>
    </div>
  );
}
