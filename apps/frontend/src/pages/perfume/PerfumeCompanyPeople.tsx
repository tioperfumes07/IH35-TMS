/**
 * PERFUME — a company's people and its name, edited from the company profile (owner 2026-11-28 14:05 CT: "I AM TRYING TO EDIT BRIAN
 * OBERLENDER, AND I AM NOT ABLE TO ADD COMPANY NAME … PEOPLES NAMES SHOULD BE ABLE TO BE ADDED TO A COMPANY PROFILE, I CAN HAVE 10
 * DIFFERENT CONTACTS IN A COMPANY").
 *   · Rename company — PATCH /companies/:id/name (renameCompany: history row, never a second record).
 *   · Add person / Edit person — one right drawer; name, title, email, other emails, phones, role.
 *   · Remove person — asked in the page (never a browser dialog), archived with a reason, shown in History.
 */
import { useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { addPerfumePerson, removePerfumePerson, renamePerfumeCompany, updatePerfumePerson, type PerfumeContactRole, type PerfumePersonInput } from "../../api/perfume";
import { ctl } from "./perfumeDocParts";

export type EditablePerson = { id: string; name: string | null; title?: string | null; email: string | null; other_emails?: string[] | null; phones: string[]; role: PerfumeContactRole | null };
const split = (v: string) => v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function RenameCompanyButton({ id, name, onSaved }: { id: string; name: string; onSaved: () => void }) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await renamePerfumeCompany(id, v.trim()); pushToast("Company name saved", "success"); setOpen(false); onSaved(); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => { setV(name); setOpen(true); }} data-testid="perfume-profile-rename">Company name</Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} title="Company name" size="sm" variant="drawer" data-testid="perfume-profile-rename-modal">
          <div className="space-y-3 text-xs">
            <label className="block">Company name<input className={`${ctl} mt-0.5 block w-full`} value={v} onChange={(e) => setV(e.target.value)} data-testid="perfume-profile-rename-input" /></label>
            <p className="text-[#64748B]">The people stay as they are — a person's name is changed on the person.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={busy || !v.trim() || v.trim() === name} onClick={() => void save()} data-testid="perfume-profile-rename-save">Save</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function PersonDrawer({ companyId, person, onClose, onSaved }: { companyId: string; person: EditablePerson | null; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const [name, setName] = useState(person?.name ?? "");
  const [title, setTitle] = useState(person?.title ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [others, setOthers] = useState((person?.other_emails ?? []).join(", "));
  const [phones, setPhones] = useState((person?.phones ?? []).join(", "));
  const [role, setRole] = useState<PerfumeContactRole | "">(person?.role ?? "");
  const [busy, setBusy] = useState(false);
  const ok = Boolean(name.trim() || email.trim() || phones.trim());
  const save = async () => {
    const body: PerfumePersonInput = { name: name.trim() || null, title: title.trim() || null, email: email.trim() || null, other_emails: split(others), phones: split(phones), role: role || null };
    setBusy(true);
    try {
      if (person) await updatePerfumePerson(person.id, body); else await addPerfumePerson(companyId, body);
      pushToast(person ? "Person saved" : "Person added", "success"); onSaved(); onClose();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const field = (label: string, v: string, set: (x: string) => void, k: string, hint?: string) => (
    <label className="block">{label}<input className={`${ctl} mt-0.5 block w-full`} value={v} onChange={(e) => set(e.target.value)} data-testid={`perfume-person-${k}`} />
      {hint ? <span className="text-[#64748B]">{hint}</span> : null}</label>
  );
  return (
    <Modal open onClose={onClose} title={person ? "Edit person" : "Add person"} size="sm" variant="drawer" data-testid="perfume-person-drawer">
      <div className="space-y-3 text-xs">
        {field("Name", name, setName, "name")}
        {field("Title", title, setTitle, "title", "Buyer, owner, accounting …")}
        {field("Email", email, setEmail, "email")}
        {field("Other emails", others, setOthers, "others", "Separate with commas")}
        {field("Phones", phones, setPhones, "phones", "Separate with commas")}
        <label className="block">Role
          <select className={`${ctl} mt-0.5 block w-full`} value={role} onChange={(e) => setRole(e.target.value as PerfumeContactRole | "")} data-testid="perfume-person-role">
            <option value="">Not set</option><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="both">Vendor + customer</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void save()} data-testid="perfume-person-save">{person ? "Save" : "Add person"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function RemovePersonModal({ person, onClose, onSaved }: { person: EditablePerson; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await removePerfumePerson(person.id, reason.trim() || undefined); pushToast("Person removed", "success"); onSaved(); onClose(); }
    catch (e) { pushToast(userFacingApiError(e, "Not removed"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Remove ${person.name ?? person.email ?? "this person"}?`} size="sm" data-testid="perfume-person-remove-modal">
      <div className="space-y-3 text-xs">
        <p>The person leaves this company's contacts. The company's History records it.</p>
        <label className="block">Reason (optional)<input className={`${ctl} mt-0.5 block w-full`} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="perfume-person-remove-reason" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="danger" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void go()} data-testid="perfume-person-remove-confirm">Remove</Button>
        </div>
      </div>
    </Modal>
  );
}
