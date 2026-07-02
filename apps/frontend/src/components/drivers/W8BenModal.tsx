import { useState } from "react";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  driverId: string;
  companyId: string;
  driverName: string;
  onClose: () => void;
  onCreated?: () => void;
};

export type W8BenBody = {
  full_legal_name: string;
  country_of_citizenship: string;
  permanent_residence_street?: string;
  permanent_residence_city?: string;
  permanent_residence_country?: string;
  mailing_address_street?: string;
  mailing_address_city?: string;
  mailing_address_country?: string;
  us_tin?: string;
  foreign_tin?: string;
  reference_numbers?: string;
  date_of_birth?: string;
  treaty_country?: string;
  treaty_article?: string;
  certification_name?: string;
  signed_date: string;
  notes?: string;
};

export function createDriverW8ben(driverId: string, companyId: string, body: W8BenBody) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/mdata/drivers/${driverId}/w8ben?operating_company_id=${encodeURIComponent(companyId)}`,
    { method: "POST", body }
  );
}

const inputCls = "rounded border border-gray-300 h-9 px-2 text-[13px]";
const labelCls = "text-xs font-semibold text-gray-600";

export function W8BenModal({ open, driverId, companyId, driverName, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState(driverName);
  const [citizenship, setCitizenship] = useState("Mexico");
  const [resStreet, setResStreet] = useState("");
  const [resCity, setResCity] = useState("");
  const [resCountry, setResCountry] = useState("Mexico");
  const [mailStreet, setMailStreet] = useState("");
  const [mailCity, setMailCity] = useState("");
  const [mailCountry, setMailCountry] = useState("");
  const [usTin, setUsTin] = useState("");
  const [foreignTin, setForeignTin] = useState("");
  const [referenceNumbers, setReferenceNumbers] = useState("");
  const [dob, setDob] = useState("");
  const [treatyCountry, setTreatyCountry] = useState("");
  const [treatyArticle, setTreatyArticle] = useState("");
  const [certName, setCertName] = useState("");
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError("");
    if (!fullName.trim()) {
      setError("Full legal name is required.");
      return;
    }
    if (!citizenship.trim()) {
      setError("Country of citizenship is required.");
      return;
    }
    if (!signedDate) {
      setError("Signed date is required.");
      return;
    }
    setPending(true);
    try {
      const trim = (v: string) => (v.trim() ? v.trim() : undefined);
      await createDriverW8ben(driverId, companyId, {
        full_legal_name: fullName.trim(),
        country_of_citizenship: citizenship.trim(),
        permanent_residence_street: trim(resStreet),
        permanent_residence_city: trim(resCity),
        permanent_residence_country: trim(resCountry),
        mailing_address_street: trim(mailStreet),
        mailing_address_city: trim(mailCity),
        mailing_address_country: trim(mailCountry),
        us_tin: trim(usTin),
        foreign_tin: trim(foreignTin),
        reference_numbers: trim(referenceNumbers),
        date_of_birth: dob || undefined,
        treaty_country: trim(treatyCountry),
        treaty_article: trim(treatyArticle),
        certification_name: trim(certName),
        signed_date: signedDate,
        notes: trim(notes),
      });
      onCreated?.();
      onClose();
    } catch {
      setError("Failed to save W-8BEN.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Create W-8BEN — ${driverName}`}>
      <form
        className="space-y-3"
        data-testid="w8ben-modal"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-xs text-slate-600">
          IRS Certificate of Foreign Status of Beneficial Owner. Required at hire for foreign (B-1)
          drivers; IH35 policy renews yearly.
        </p>

        <div className="text-[11px] font-semibold uppercase text-slate-500">Part I — Beneficial owner</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Full legal name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} data-testid="w8ben-name" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Country of citizenship</label>
            <input value={citizenship} onChange={(e) => setCitizenship(e.target.value)} className={inputCls} data-testid="w8ben-citizenship" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Permanent residence — street</label>
            <input value={resStreet} onChange={(e) => setResStreet(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Permanent residence — city</label>
            <input value={resCity} onChange={(e) => setResCity(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Permanent residence — country</label>
            <input value={resCountry} onChange={(e) => setResCountry(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Mailing address — street (if different)</label>
            <input value={mailStreet} onChange={(e) => setMailStreet(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Mailing address — city</label>
            <input value={mailCity} onChange={(e) => setMailCity(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Mailing address — country</label>
            <input value={mailCountry} onChange={(e) => setMailCountry(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>U.S. TIN / SSN / ITIN (usually blank)</label>
            <input value={usTin} onChange={(e) => setUsTin(e.target.value)} className={inputCls} data-testid="w8ben-us-tin" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Foreign TIN (Mexican RFC / CURP)</label>
            <input value={foreignTin} onChange={(e) => setForeignTin(e.target.value)} className={inputCls} data-testid="w8ben-foreign-tin" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Reference number(s)</label>
            <input value={referenceNumbers} onChange={(e) => setReferenceNumbers(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} data-testid="w8ben-dob" />
          </div>
        </div>

        <div className="text-[11px] font-semibold uppercase text-slate-500">Part II — Treaty claim (optional, usually N/A)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Treaty country</label>
            <input value={treatyCountry} onChange={(e) => setTreatyCountry(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Treaty article</label>
            <input value={treatyArticle} onChange={(e) => setTreatyArticle(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="text-[11px] font-semibold uppercase text-slate-500">Part III — Certification</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Certification signature name</label>
            <input value={certName} onChange={(e) => setCertName(e.target.value)} className={inputCls} data-testid="w8ben-cert-name" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Signed date</label>
            <input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} className={inputCls} data-testid="w8ben-signed" required />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={2}
            maxLength={2000}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} data-testid="w8ben-submit">
            Create Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}
