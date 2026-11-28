/**
 * TIO Perfumes · Vendors / Customers · Create — owner 2026-11-27 18:21 CT: "we are missing create vendor create customer, and the correct pop
 * up and profile creator". A QuickBooks-style pop-up: the company (name, type, business type, phone, web, address) and its first contact
 * person. Saved through the contacts import engine, so a company already on file (same name key, phone or domain) is never created twice —
 * the pop-up says so and opens that profile instead.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { createPerfumeCompany, listPerfumeCatalogs } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";

type Role = "vendor" | "customer" | "both";
const EMPTY = { name: "", role: "vendor" as Role, type: "", segment: "", phone: "", website: "", address: "", city: "", state: "", zip: "", country: "", notes: "",
  person: "", title: "", email: "", personPhone: "" };

export function PerfumeCreateCompany({ role, onCreated, onOpen }: { role: "vendor" | "customer"; onCreated: (name: string) => void; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setOpen(true)} data-testid={`perfume-create-${role}`}>
        {role === "vendor" ? tr("perfume.create.vendor", "+ Create vendor") : tr("perfume.create.customer", "+ Create customer")}</Button>
      {open ? <CreateModal role={role} onClose={() => setOpen(false)} onCreated={onCreated} onOpen={onOpen} /> : null}
    </div>
  );
}

function CreateModal({ role, onClose, onCreated, onOpen }: { role: "vendor" | "customer"; onClose: () => void; onCreated: (name: string) => void; onOpen: (id: string) => void }) {
  const { pushToast } = useToast();
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs });
  const [v, setV] = useState({ ...EMPTY, role: role as Role });
  const [busy, setBusy] = useState(false);
  const values = (kind: string) => (cats.data?.kinds.find((k) => k.kind === kind)?.values ?? []).map((x) => x.value);
  const typeKind = v.role === "customer" ? "customer_type" : "vendor_type";
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const nul = (s: string) => (s.trim() ? s.trim() : null);
  const save = async () => {
    setBusy(true);
    try {
      const domain = nul(v.website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ?? "") ?? (v.email.includes("@") ? v.email.split("@")[1]!.toLowerCase() : null);
      const r = await createPerfumeCompany({
        company: { name: v.name.trim(), role: v.role, source: "Created in app", domain, website: nul(v.website), phone: nul(v.phone), address: nul(v.address), city: nul(v.city),
          state: nul(v.state), zip: nul(v.zip), country: nul(v.country), notes: nul(v.notes), segment: nul(v.segment),
          vendor_type: v.role !== "customer" ? nul(v.type) : null, customer_type: v.role === "customer" ? nul(v.type) : null, status: "active" },
        people: v.person.trim() || v.email.trim() ? [{ name: nul(v.person), title: nul(v.title), email: nul(v.email.toLowerCase()), phones: v.personPhone.trim() ? [v.personPhone.trim()] : [], role: v.role }] : [],
        origins: [{ how: "Created in app", source: role === "vendor" ? "Vendors · Create vendor" : "Customers · Create customer" }],
      });
      pushToast(r.existed ? `${v.name.trim()} is already on file — opened its profile (no second record)` : `${v.name.trim()} created`, r.existed ? "info" : "success");
      onCreated(v.name.trim()); if (r.id) onOpen(r.id); onClose();
    } catch (e) { pushToast(userFacingApiError(e, "Not created"), "error"); } finally { setBusy(false); }
  };
  const field = (label: string, el: React.ReactNode) => <label className="block text-xs">{label}<div className="mt-0.5">{el}</div></label>;
  return (
    <Modal open onClose={onClose} title={role === "vendor" ? tr("perfume.create.vendor_title", "New vendor") : tr("perfume.create.customer_title", "New customer")} size="lg" variant="drawer" data-testid="perfume-create-modal">
      <div className="space-y-3 text-xs">
        <div className="text-card-title">{tr("perfume.create.company", "Company")}</div>
        <div className="grid gap-2 md:grid-cols-3">
          {field(`${tr("perfume.create.name", "Company name")} *`, <input className={`${ctl} w-full`} value={v.name} onChange={set("name")} data-testid="perfume-create-name" />)}
          {field(tr("perfume.create.role", "Is a"), (
            <select className={`${ctl} w-full`} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role, type: "" })} data-testid="perfume-create-role">
              <option value="vendor">Vendor</option><option value="customer">Customer</option><option value="both">Vendor + customer</option>
            </select>))}
          {field(v.role === "customer" ? tr("perfume.create.ctype", "Customer type") : tr("perfume.create.vtype", "Vendor type"), (
            <select className={`${ctl} w-full`} value={v.type} onChange={set("type")} data-testid="perfume-create-type">
              <option value="">—</option>{values(typeKind).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>))}
          {field(tr("perfume.create.segment", "Business type"), (
            <select className={`${ctl} w-full`} value={v.segment} onChange={set("segment")} data-testid="perfume-create-segment">
              <option value="">—</option>{values("segment").map((x) => <option key={x} value={x}>{x}</option>)}
            </select>))}
          {field(tr("perfume.create.phone", "Phone"), <input className={`${ctl} w-full`} value={v.phone} onChange={set("phone")} />)}
          {field(tr("perfume.create.website", "Website"), <input className={`${ctl} w-full`} value={v.website} onChange={set("website")} />)}
          {field(tr("perfume.create.address", "Address"), <input className={`${ctl} w-full`} value={v.address} onChange={set("address")} />)}
          {field(tr("perfume.create.city", "City"), <input className={`${ctl} w-full`} value={v.city} onChange={set("city")} />)}
          {field(tr("perfume.create.state", "State"), <input className={`${ctl} w-full`} value={v.state} onChange={set("state")} />)}
          {field(tr("perfume.create.zip", "ZIP"), <input className={`${ctl} w-full`} value={v.zip} onChange={set("zip")} />)}
          {field(tr("perfume.create.country", "Country"), <input className={`${ctl} w-full`} value={v.country} onChange={set("country")} />)}
          {field(tr("perfume.create.notes", "Notes"), <input className={`${ctl} w-full`} value={v.notes} onChange={set("notes")} />)}
        </div>
        <div className="text-card-title">{tr("perfume.create.person", "Contact person")}</div>
        <div className="grid gap-2 md:grid-cols-4">
          {field(tr("perfume.create.pname", "Name"), <input className={`${ctl} w-full`} value={v.person} onChange={set("person")} data-testid="perfume-create-person" />)}
          {field(tr("perfume.create.ptitle", "Title"), <input className={`${ctl} w-full`} value={v.title} onChange={set("title")} />)}
          {field(tr("perfume.create.pemail", "E-mail"), <input type="email" className={`${ctl} w-full`} value={v.email} onChange={set("email")} />)}
          {field(tr("perfume.create.pphone", "Phone"), <input className={`${ctl} w-full`} value={v.personPhone} onChange={set("personPhone")} />)}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !v.name.trim()} onClick={() => void save()} data-testid="perfume-create-save">
            {role === "vendor" ? tr("perfume.create.save_vendor", "Create vendor") : tr("perfume.create.save_customer", "Create customer")}</Button>
        </div>
      </div>
    </Modal>
  );
}
