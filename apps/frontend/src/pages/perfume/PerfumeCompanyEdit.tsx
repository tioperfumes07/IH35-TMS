/**
 * TIO Perfumes · Company profile · Edit — owner 2026-11-27 18:21 CT "the correct pop up and profile creator"; 16:54 CT "not mix". A pop-up
 * that edits the company's contact fields and its four contact lists (Relationship, Industry, Review tags, Business type), each offered
 * from its own catalog. Saved with one history row listing every change (backend company-details.service.ts).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { listPerfumeCatalogs, updatePerfumeCompanyDetails } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";

const TEXT = [["phone", "Phone"], ["website", "Website"], ["address", "Address"], ["city", "City"], ["state", "State"], ["zip", "ZIP"], ["country", "Country"], ["notes", "Notes"]] as const;
type Co = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export function PerfumeCompanyEdit({ id, co, onSaved }: { id: string; co: Co; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setOpen(true)} data-testid="perfume-company-edit">{tr("perfume.coedit.edit", "Edit company")}</Button>
      {open ? <EditModal id={id} co={co} onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}

function EditModal({ id, co, onClose, onSaved }: { id: string; co: Co; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs });
  const values = (kind: string) => (cats.data?.kinds.find((k) => k.kind === kind)?.values ?? []).map((x) => x.value);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries([...TEXT.map(([k]) => [k, s(co[k])]), ["segment", s(co["segment"])], ["main_category", s(co["main_category"])]]));
  const [industries, setIndustries] = useState<string[]>(arr(co["categories"]));
  const [tags, setTags] = useState<string[]>(arr(co["review_tags"]));
  const [busy, setBusy] = useState(false);
  const opts = (kind: string, cur: string[]) => [...new Set([...values(kind), ...cur])].map((x) => ({ value: x, label: x }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await updatePerfumeCompanyDetails(id, { ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])), categories: industries, review_tags: tags });
      pushToast(r.changed ? `${r.changed} field(s) saved — in the company's history` : "Nothing changed", r.changed ? "success" : "info");
      onSaved(); onClose();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const sel = (k: "segment" | "main_category", kind: string, label: string) => (
    <label className="block text-xs">{label}
      <select className={`${ctl} mt-0.5 block w-full`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`perfume-coedit-${k}`}>
        <option value="">—</option>{[...new Set([...values(kind), ...(v[k] ? [v[k]!] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </label>);
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.coedit.title", "Edit")} ${s(co["name"])}`} size="lg" data-testid="perfume-coedit-modal">
      <div className="space-y-3 text-xs">
        <div className="text-card-title">{tr("perfume.coedit.lists", "Relationship, industry and tags")}</div>
        <div className="grid gap-2 md:grid-cols-2">
          {sel("main_category", "category", tr("perfume.coedit.rel", "Relationship"))}
          {sel("segment", "segment", tr("perfume.coedit.seg", "Business type"))}
          <div><div>{tr("perfume.coedit.ind", "Industry")}</div><MultiSelectDropdown label="Industry" allLabel="None" options={opts("industry", industries)} selected={industries} onChange={setIndustries} data-testid="perfume-coedit-industry" /></div>
          <div><div>{tr("perfume.coedit.tags", "Review tags")}</div><MultiSelectDropdown label="Review tags" allLabel="None" options={opts("review_tag", tags)} selected={tags} onChange={setTags} data-testid="perfume-coedit-tags" /></div>
        </div>
        <div className="text-card-title">{tr("perfume.coedit.contact", "Contact details")}</div>
        <div className="grid gap-2 md:grid-cols-3">
          {TEXT.map(([k, l]) => (
            <label key={k} className="block text-xs">{l}<input className={`${ctl} mt-0.5 block w-full`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`perfume-coedit-${k}`} /></label>
          ))}
        </div>
        <p className="text-[#64748B]">{tr("perfume.coedit.note", "Name, role (vendor / customer) and vendor / customer type are changed from the company's name and Convert buttons.")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void save()} data-testid="perfume-coedit-save">{tr("perfume.coedit.save", "Save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
