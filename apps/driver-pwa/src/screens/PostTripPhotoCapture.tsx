import { useMemo, useRef, useState } from "react";
import { AngleGuide } from "../components/photo/AngleGuide";
import { PwaButton } from "../components/PwaButton";
import { useToast } from "../components/Toast";
import { uploadRawPhoto } from "../lib/preserve-exif-on-upload";

const ANGLES = [
  { key: "front", instruction: "Stand directly in front of the unit." },
  { key: "rear", instruction: "Stand directly behind the unit." },
  { key: "driver-side", instruction: "Capture the full driver side." },
  { key: "passenger-side", instruction: "Capture the full passenger side." },
  { key: "front-left", instruction: "Stand at the front-left corner." },
  { key: "front-right", instruction: "Stand at the front-right corner." },
  { key: "rear-left", instruction: "Stand at the rear-left corner." },
  { key: "rear-right", instruction: "Stand at the rear-right corner." },
] as const;

type Props = {
  sessionUuid: string;
  loadUuid?: string;
  driverUuid: string;
  unitUuid: string;
  operatingCompanyId: string;
  onComplete: () => void;
};

export function PostTripPhotoCapture({
  sessionUuid,
  loadUuid,
  driverUuid,
  unitUuid,
  operatingCompanyId,
  onComplete,
}: Props) {
  const { pushToast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(0);
  const [evidenceUuids, setEvidenceUuids] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const current = ANGLES[step];
  const progress = useMemo(() => `${step + 1} / ${ANGLES.length}`, [step]);

  async function uploadAngle(file: File) {
    const params = new URLSearchParams({
      operating_company_id: operatingCompanyId,
      driver_uuid: driverUuid,
      unit_uuid: unitUuid,
      angle_label: current.key,
    });
    if (loadUuid) params.set("load_uuid", loadUuid);

    const response = await uploadRawPhoto(`/api/safety/photo-comparison/evidence?${params.toString()}`, file, {
      credentials: "include",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "upload_failed");
    }
    const payload = (await response.json()) as { evidence_uuid: string };
    return payload.evidence_uuid;
  }

  async function handleCapture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const uuid = await uploadAngle(file);
      const next = [...evidenceUuids, uuid];
      setEvidenceUuids(next);
      if (step + 1 >= ANGLES.length) {
        const response = await fetch(`/api/safety/photo-comparison/${sessionUuid}/post-trip`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operating_company_id: operatingCompanyId,
            evidence_uuids: next,
          }),
        });
        if (!response.ok) throw new Error("post_trip_submit_failed");
        pushToast("Post-trip photos submitted — AI diff running", "success");
        onComplete();
      } else {
        setStep(step + 1);
        pushToast(`Captured ${current.key}`, "success");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Capture failed", "error");
    } finally {
      setSubmitting(false);
      event.target.value = "";
    }
  }

  return (
    <div className="relative min-h-[60vh] overflow-hidden rounded-xl border border-pwa-border bg-[#0b1020]" data-testid="post-trip-photo-capture">
      <AngleGuide angle={current.key} instruction={current.instruction} />
      <div className="relative z-10 space-y-3 p-4">
        <p className="text-sm text-pwa-text-secondary">Post-trip capture · {progress}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="post-trip-photo-input"
          onChange={handleCapture}
        />
        <PwaButton className="w-full" disabled={submitting} onClick={() => inputRef.current?.click()}>
          {submitting ? "Uploading…" : `Capture ${current.key}`}
        </PwaButton>
      </div>
    </div>
  );
}
