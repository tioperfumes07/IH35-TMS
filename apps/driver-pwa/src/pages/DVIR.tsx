import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createEmptyInspectionItems, submitDvir } from "../api/dvir";
import { DvirItemRow, MAX_DVIR_DEFECT_PHOTOS } from "../components/DvirItemRow";
import { SignaturePad } from "../components/SignaturePad";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";

export function DvirPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locationPath = useLocation();
  const { loadId = "" } = useParams();
  const isPostTrip = locationPath.pathname.includes("/dvir/post/");
  const [items, setItems] = useState(createEmptyInspectionItems());
  const [unit, setUnit] = useState("Unit 0234");
  const [trailer, setTrailer] = useState("TRL-8821");
  const [odometer, setOdometer] = useState("187234");
  const [location, setLocation] = useState("I-35 NB MM 287");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oosBlocked, setOosBlocked] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [activePhotoItem, setActivePhotoItem] = useState(0);

  const hasMajor = items.some((item) => item.status === "major");
  const majorItemsValid = items
    .filter((item) => item.status === "major")
    .every((item) => item.note.trim().length > 0 && item.photo_keys.length > 0);
  const canSubmit = Boolean(signature) && (!hasMajor || majorItemsValid);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const payload = {
        load_id: loadId,
        mode: isPostTrip ? ("post" as const) : ("pre" as const),
        unit,
        trailer,
        odometer: Number(odometer || 0),
        location,
        certified_at: new Date().toISOString(),
        signature_data_url: signature,
        out_of_service: hasMajor,
        items,
      };
      await submitDvir(payload);
      if (hasMajor) {
        setOosBlocked(true);
        return;
      }
      navigate(`/loads/${loadId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary" data-testid={isPostTrip ? "dvir-post-page" : "dvir-pre-page"}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-28">
        <PwaCard title={isPostTrip ? t("dvir.title_post") : t("dvir.title_pre")} subtitle={`Load ${loadId}`}>
          <div className="grid gap-2">
            <input value={unit} onChange={(event) => setUnit(event.target.value)} className="h-10 rounded border border-pwa-border bg-[#101522] px-2 text-sm" placeholder={t("dvir.unit")} />
            <input value={trailer} onChange={(event) => setTrailer(event.target.value)} className="h-10 rounded border border-pwa-border bg-[#101522] px-2 text-sm" placeholder={t("dvir.trailer")} />
            <input value={odometer} onChange={(event) => setOdometer(event.target.value)} className="h-10 rounded border border-pwa-border bg-[#101522] px-2 text-sm" placeholder={t("dvir.odometer")} />
            <input value={location} onChange={(event) => setLocation(event.target.value)} className="h-10 rounded border border-pwa-border bg-[#101522] px-2 text-sm" placeholder={t("dvir.location")} />
          </div>
        </PwaCard>

        {oosBlocked ? <div className="rounded border border-[#7f1d1d] bg-[#7f1d1d] px-3 py-2 text-sm text-[#fca5a5]">{t("dvir.oos_banner")}</div> : null}
        {hasMajor ? <div className="rounded border border-[#7f1d1d] bg-[#2a1417] px-3 py-2 text-xs text-[#fca5a5]">{t("dvir.major_blocks")}</div> : null}

        {items.map((item, idx) => (
          <DvirItemRow
            key={item.key}
            item={item}
            label={t(`dvir.items.${item.key}`)}
            noteRequiredLabel={t("dvir.note_required")}
            photoRequiredLabel={t("dvir.photo_required")}
            onStatusChange={(status) =>
              setItems((current) => current.map((candidate, cIdx) => (cIdx === idx ? { ...candidate, status } : candidate)))
            }
            onNoteChange={(note) =>
              setItems((current) => current.map((candidate, cIdx) => (cIdx === idx ? { ...candidate, note } : candidate)))
            }
            onAddPhoto={() => {
              setActivePhotoItem(idx);
              setPhotoModalOpen(true);
            }}
          />
        ))}

        <PwaCard>
          <div className="mb-2 text-xs text-pwa-text-secondary">{t("dvir.cert_text")}</div>
          <div className="mb-2 text-xs font-semibold text-pwa-text-secondary">{t("dvir.signature")}</div>
          <SignaturePad onChange={setSignature} />
        </PwaCard>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-pwa-border bg-pwa-card px-4 py-3">
        <div className="mx-auto w-full max-w-md">
          <PwaButton disabled={!canSubmit || submitting} className="w-full" onClick={() => void onSubmit()}>
            {t("dvir.submit")}
          </PwaButton>
        </div>
      </div>

      <UploadDocumentModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onQueued={() => {
          setItems((current) =>
            current.map((candidate, cIdx) => {
              if (cIdx !== activePhotoItem) return candidate;
              if (candidate.photo_keys.length >= MAX_DVIR_DEFECT_PHOTOS) return candidate;
              return { ...candidate, photo_keys: [...candidate.photo_keys, `queued-photo-${Date.now()}`] };
            })
          );
        }}
        defaultEntityType="standalone"
        defaultEntityId={null}
        allowedCategoryCodes={["dvir", "damage_photo", "other"]}
        title={t("dvir.signature")}
      />
    </div>
  );
}
