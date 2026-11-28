/**
 * TIO Perfumes · Company profile · Edit — owner 2026-11-27 18:21 CT "the correct pop up and profile creator"; 16:54 CT "not mix". A pop-up
 * that edits the company's contact fields and its four contact lists (Relationship, Industry, Review tags, Business type), each offered
 * from its own catalog. Saved with one history row listing every change (backend company-details.service.ts).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { listPerfumeCatalogs, updatePerfumeCompanyDetails } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { CompanyFields, type CompanyFormValues } from "./PerfumeCompanyForm";

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
  const values = (kind: string) => (cats.data?.kinds?.find((k) => k.kind === kind)?.values ?? []).map((x) => x.value);
  const lists = { category: values("category"), segment: values("segment"), industry: values("industry"), review_tag: values("review_tag") };
  const first = (list: unknown, single: unknown) => (arr(list).length ? arr(list) : s(single) ? [s(single)] : []);
  const [v, setV] = useState<CompanyFormValues>({
    phone: s(co["phone"]), website: s(co["website"]), address: s(co["address"]), city: s(co["city"]), state: s(co["state"]), zip: s(co["zip"]),
    country: s(co["country"]), notes: s(co["notes"]),
    relationships: first(co["relationships"], co["main_category"]), business_types: first(co["business_types"], co["segment"]),
    categories: arr(co["categories"]), review_tags: arr(co["review_tags"]),
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const t = (x: string) => x.trim() || null;
      const r = await updatePerfumeCompanyDetails(id, { phone: t(v.phone), website: t(v.website), address: t(v.address), city: t(v.city), state: t(v.state), zip: t(v.zip),
        country: t(v.country), notes: t(v.notes), relationships: v.relationships, business_types: v.business_types, categories: v.categories, review_tags: v.review_tags });
      pushToast(r.changed ? `${r.changed} field(s) saved — in the company's history` : "Nothing changed", r.changed ? "success" : "info");
      onSaved(); onClose();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.coedit.title", "Edit")} ${s(co["name"])}`} size="lg" variant="drawer" data-testid="perfume-coedit-modal">
      <div className="space-y-3 text-xs">
        <CompanyFields v={v} set={setV} lists={lists} testPrefix="perfume-coedit" />
        <p className="text-[#64748B]">{tr("perfume.coedit.note2", "The company name has its own \"Company name\" button; people are added and changed on the Emails & contacts tab.")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void save()} data-testid="perfume-coedit-save">{tr("perfume.coedit.save", "Save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
