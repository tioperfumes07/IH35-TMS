import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { inferSeverity } from "../components/IncidentTypeRadio";
import { IncidentTypePicker } from "../components/incident/IncidentTypePicker";
import { PhotoChain, type IncidentPhotoEntry } from "../components/incident/PhotoChain";
import { PoliceReportPicker, type PoliceReportValue } from "../components/incident/PoliceReportPicker";
import { WitnessForm, type WitnessEntry } from "../components/incident/WitnessForm";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { type DriverIncidentType, submitIncident } from "../api/incidents";
import { useToast } from "../components/Toast";
import { enqueueUpload, type UploadQueueItem } from "../lib/upload-queue";

export function IncidentReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [type, setType] = useState<DriverIncidentType>("damage");
  const [incidentSubtype, setIncidentSubtype] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [locationLabel, setLocationLabel] = useState("Driver PWA");
  const [location, setLocation] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [photos, setPhotos] = useState<IncidentPhotoEntry[]>([]);
  const [witnesses, setWitnesses] = useState<WitnessEntry[]>([]);
  const [policeReport, setPoliceReport] = useState<PoliceReportValue>({
    has_report: false,
    report_number: "",
    agency: "",
    officer_name: "",
    notes: "",
  });
  const [criticalConfirmOpen, setCriticalConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loadId = searchParams.get("loadId") ?? "load-1002";
  const stopId = searchParams.get("stopId") ?? undefined;
  const severity = useMemo(() => inferSeverity(type), [type]);
  const isCritical = severity === "critical";

  async function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
    });
  }

  async function queuePhotoChain(): Promise<{ documentKeys: string[]; photoExif: Array<Record<string, unknown>> }> {
    const documentKeys: string[] = [];
    const photoExif: Array<Record<string, unknown>> = [];
    for (const photo of photos) {
      const item: UploadQueueItem = {
        id: `incident-photo-${photo.id}`,
        file_blob: photo.file,
        mime_type: photo.file.type || "application/octet-stream",
        original_filename: photo.file.name,
        size_bytes: photo.file.size,
        category_id: null,
        entity_type: "load",
        entity_id: loadId,
        document_date: occurredAt.slice(0, 10),
        expiration_date: null,
        description: "incident_photo_chain",
        retry_count: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        status: "pending",
        next_retry_at: null,
      };
      await enqueueUpload(item);
      documentKeys.push(item.id);
      photoExif.push(photo.exif as Record<string, unknown>);
    }
    return { documentKeys, photoExif };
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      const { documentKeys, photoExif } = await queuePhotoChain();
      await submitIncident({
        load_id: loadId,
        stop_id: stopId,
        type,
        severity,
        description,
        incident_subtype: incidentSubtype.trim() || null,
        location_label: locationLabel.trim() || null,
        lat: location.lat,
        lng: location.lng,
        occurred_at: new Date(occurredAt).toISOString(),
        document_keys: documentKeys,
        witnesses: witnesses
          .filter((entry) => entry.name.trim() || entry.phone.trim() || entry.statement.trim())
          .map((entry) => ({
            name: entry.name.trim(),
            phone: entry.phone.trim(),
            statement: entry.statement.trim(),
          })),
        police_report: {
          has_report: policeReport.has_report,
          report_number: policeReport.report_number.trim() || null,
          agency: policeReport.agency.trim() || null,
          officer_name: policeReport.officer_name.trim() || null,
          notes: policeReport.notes.trim() || null,
        },
        photo_exif: photoExif,
      });
      pushToast(t("incident.reported_toast"), "success");
      navigate(`/loads/${loadId}`);
    } catch {
      pushToast(t("common.retry"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  function canProceedFromCurrentStep() {
    if (step === 1) return true;
    if (step === 2) return description.trim().length >= 10;
    if (step === 3) return true;
    if (step === 4) return true;
    if (step === 5) return !policeReport.has_report || policeReport.report_number.trim().length >= 3;
    return true;
  }

  function renderStepBody() {
    if (step === 1) {
      return (
        <div className="space-y-3">
          <div className="text-xs text-pwa-text-secondary">{t("incident.type_label")}</div>
          <IncidentTypePicker
            value={type}
            onChange={setType}
            labels={{
              accident: t("incident.types.accident"),
              damage: t("incident.types.damage"),
              cargo: t("incident.types.cargo"),
              equipment: t("incident.types.equipment"),
              injury: t("incident.types.injury"),
              breakdown: t("incident.types.breakdown"),
              other: t("incident.types.other"),
            }}
          />
          <div className="text-xs text-pwa-text-secondary">
            {t("incident.severity_label")}: <span className="font-semibold">{t(`incident.severities.${severity}`)}</span>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-3">
          <input
            type="text"
            value={incidentSubtype}
            onChange={(event) => setIncidentSubtype(event.target.value)}
            className="h-10 w-full rounded border border-pwa-border bg-[#101522] px-2 text-sm"
            placeholder={t("incident.subtype_placeholder")}
          />
          <textarea
            className="h-28 w-full rounded border border-pwa-border bg-[#101522] p-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("incident.description_min")}
          />
          <label className="block text-xs text-pwa-text-secondary">
            {t("incident.occurred_at")}
            <input
              type="datetime-local"
              className="mt-1 h-10 w-full rounded border border-pwa-border bg-[#101522] px-2 text-sm text-pwa-text-primary"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
          <input
            type="text"
            value={locationLabel}
            onChange={(event) => setLocationLabel(event.target.value)}
            className="h-10 w-full rounded border border-pwa-border bg-[#101522] px-2 text-sm"
            placeholder={t("incident.location_label")}
          />
          <div className="flex gap-2">
            <PwaButton variant="secondary" onClick={() => void useMyLocation()}>
              {t("incident.use_my_location")}
            </PwaButton>
          </div>
          <div className="text-xs text-pwa-text-secondary">
            {t("incident.location_label")}: {location.lat ?? "--"}, {location.lng ?? "--"}
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <PhotoChain
          photos={photos}
          onChange={setPhotos}
          labels={{
            title: t("incident.photos_label"),
            add: t("incident.photos_add"),
            add_more: t("incident.photos_add_more"),
            remove: t("incident.remove"),
            exif: t("incident.exif_preserved"),
            none: t("incident.photos_none"),
          }}
        />
      );
    }

    if (step === 4) {
      return (
        <WitnessForm
          value={witnesses}
          onChange={setWitnesses}
          labels={{
            title: t("incident.witnesses_title"),
            add: t("incident.witness_add"),
            remove: t("incident.remove"),
            name: t("incident.witness_name"),
            phone: t("incident.witness_phone"),
            statement: t("incident.witness_statement"),
            none: t("incident.witness_none"),
          }}
        />
      );
    }

    if (step === 5) {
      return (
        <PoliceReportPicker
          value={policeReport}
          onChange={setPoliceReport}
          labels={{
            title: t("incident.police_title"),
            has_report: t("incident.police_has_report"),
            no_report: t("incident.police_no_report"),
            report_number: t("incident.police_number"),
            agency: t("incident.police_agency"),
            officer_name: t("incident.police_officer"),
            notes: t("incident.police_notes"),
          }}
        />
      );
    }

    return (
      <div className="space-y-2 text-xs text-pwa-text-secondary">
        <div>
          {t("incident.type_label")}: {t(`incident.types.${type}`)}
        </div>
        <div>
          {t("incident.severity_label")}: {t(`incident.severities.${severity}`)}
        </div>
        <div>
          {t("incident.photos_label")}: {photos.length}
        </div>
        <div>
          {t("incident.witnesses_title")}: {witnesses.length}
        </div>
        <div>
          {t("incident.police_title")}: {policeReport.has_report ? t("incident.police_has_report") : t("incident.police_no_report")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("incident.title")} subtitle={t("incident.step_n", { n: step, max: 6 })}>
          <div className="mb-2 text-xs text-pwa-text-secondary">{t("incident.linked_load") + `: ${loadId}`}</div>
          {stopId ? <div className="mb-3 text-xs text-pwa-text-secondary">{t("incident.linked_stop")}: {stopId}</div> : null}
          {renderStepBody()}
        </PwaCard>

        <div className="flex gap-2">
          <PwaButton variant="secondary" className="flex-1" disabled={step === 1 || submitting} onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5 | 6)}>
            {t("common.back")}
          </PwaButton>
          {step < 6 ? (
            <PwaButton className="flex-1" disabled={!canProceedFromCurrentStep() || submitting} onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4 | 5 | 6)}>
              {t("common.next")}
            </PwaButton>
          ) : (
            <PwaButton
              className="flex-1"
              disabled={submitting}
              onClick={() => {
                if (isCritical) {
                  setCriticalConfirmOpen(true);
                  return;
                }
                void doSubmit();
              }}
            >
              {t("incident.submit")}
            </PwaButton>
          )}
        </div>
      </div>

      {criticalConfirmOpen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[#dc2626] bg-pwa-card p-3">
            <div className="text-sm font-semibold text-[#fca5a5]">{t("incident.confirm_critical")}</div>
            <div className="mt-1 text-xs text-pwa-text-secondary">{t("incident.alert_dispatch")}</div>
            <div className="mt-3 flex gap-2">
              <PwaButton variant="secondary" className="flex-1" onClick={() => setCriticalConfirmOpen(false)}>
                {t("common.cancel")}
              </PwaButton>
              <PwaButton
                className="flex-1"
                onClick={() => {
                  setCriticalConfirmOpen(false);
                  void doSubmit();
                }}
              >
                {t("incident.submit")}
              </PwaButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
