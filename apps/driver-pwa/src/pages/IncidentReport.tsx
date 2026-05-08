import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IncidentTypeRadio, inferSeverity } from "../components/IncidentTypeRadio";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { type DriverIncidentType, submitIncident } from "../api/incidents";
import { useToast } from "../components/Toast";

export function IncidentReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<DriverIncidentType>("check_engine_warning");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
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

  async function doSubmit() {
    setSubmitting(true);
    try {
      await submitIncident({
        load_id: loadId,
        stop_id: stopId,
        type,
        severity,
        description,
        lat: location.lat,
        lng: location.lng,
        occurred_at: new Date().toISOString(),
        document_keys: documentKeys,
      });
      pushToast(t("incident.reported_toast"), "success");
      navigate(`/loads/${loadId}`);
    } catch {
      pushToast(t("common.retry"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title={t("incident.title")} subtitle={t("incident.linked_load") + `: ${loadId}`}>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-pwa-text-secondary">{t("incident.type_label")}</div>
              <IncidentTypeRadio
                value={type}
                onChange={setType}
                labels={{
                  check_engine_warning: t("incident.types.check_engine_warning"),
                  mechanical_breakdown: t("incident.types.mechanical_breakdown"),
                  accident_minor: t("incident.types.accident_minor"),
                  accident_major: t("incident.types.accident_major"),
                  cargo_issue: t("incident.types.cargo_issue"),
                  other: t("incident.types.other"),
                }}
              />
            </div>
            <div className="text-xs">
              {t("incident.severity_label")}: <span className="font-semibold">{t(`incident.severities.${severity}`)}</span>
            </div>
            <div>
              <div className="mb-1 text-xs text-pwa-text-secondary">{t("incident.description_label")}</div>
              <textarea
                className="h-24 w-full rounded border border-pwa-border bg-[#101522] p-2 text-sm"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("incident.description_min")}
              />
            </div>
            <div className="flex gap-2">
              <PwaButton variant="secondary" onClick={() => void useMyLocation()}>
                {t("incident.use_my_location")}
              </PwaButton>
              <PwaButton variant="secondary" onClick={() => setUploadOpen(true)}>
                {t("incident.photos_label")} ({documentKeys.length})
              </PwaButton>
            </div>
            <div className="text-xs text-pwa-text-secondary">
              {t("incident.location_label")}: {location.lat ?? "--"}, {location.lng ?? "--"}
            </div>
            {stopId ? <div className="text-xs text-pwa-text-secondary">{t("incident.linked_stop")}: {stopId}</div> : null}
          </div>
        </PwaCard>

        <PwaButton
          className="w-full"
          disabled={description.trim().length < 10 || submitting}
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

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onQueued={() => setDocumentKeys((current) => [...current, `queued-doc-${Date.now()}`])}
        defaultEntityType="standalone"
        defaultEntityId={null}
        allowedCategoryCodes={["damage_photo", "other"]}
        title={t("incident.photos_label")}
      />
    </div>
  );
}
