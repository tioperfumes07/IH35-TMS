import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  adminOverrideOnboardingSession,
  completeOnboardingSession,
  getOnboardingSession,
  ONBOARDING_STEP_LABELS,
  saveOnboardingStep,
  type OnboardingSession,
} from "../../api/onboarding";
import { confirmUpload, requestUploadUrl } from "../../api/docs";
import { listUnits } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { OnboardingStepCdlUpload } from "./onboarding/OnboardingStepCdlUpload";
import { OnboardingStepDqfDocs } from "./onboarding/OnboardingStepDqfDocs";
import { OnboardingStepI9 } from "./onboarding/OnboardingStepI9";
import { OnboardingStepIdentity } from "./onboarding/OnboardingStepIdentity";
import { OnboardingStepMedicalCard } from "./onboarding/OnboardingStepMedicalCard";
import { OnboardingStepSignatures } from "./onboarding/OnboardingStepSignatures";
import { OnboardingStepVehicleAssignment } from "./onboarding/OnboardingStepVehicleAssignment";

function stepDataFor(session: OnboardingSession | undefined, key: string) {
  return (session?.step_data?.[key] as Record<string, unknown> | undefined) ?? {};
}

async function uploadDriverDoc(file: File, driverId: string | null | undefined) {
  const { file_id, presigned_url } = await requestUploadUrl({
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    entity_links: driverId ? [{ entity_type: "driver", entity_id: driverId }] : undefined,
  });
  await fetch(presigned_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  await confirmUpload(file_id);
  return { file_id, file_name: file.name };
}

export function OnboardingWizardPage() {
  const { session_id: sessionId } = useParams<{ session_id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const sessionQ = useQuery({
    queryKey: ["onboarding-session", companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => getOnboardingSession(sessionId!, companyId),
  });

  const unitsQ = useQuery({
    queryKey: ["onboarding-units", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listUnits({ operating_company_id: companyId }).then((r) => r.units),
  });

  const session = sessionQ.data?.session;
  const driverId = session?.driver_id ?? null;

  const activeStep = session ? Math.max(0, Math.min(6, (session.current_step ?? 1) - 1, stepIndex)) : stepIndex;

  const saveMut = useMutation({
    mutationFn: (payload: { step: number; step_data: Record<string, unknown>; advance?: boolean }) =>
      saveOnboardingStep(sessionId!, companyId, payload),
    onSuccess: (data) => {
      qc.setQueryData(["onboarding-session", companyId, sessionId], (prev: typeof sessionQ.data) =>
        prev ? { ...prev, session: data.session } : prev
      );
      if (data.session.current_step > activeStep + 1) {
        setStepIndex(data.session.current_step - 1);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const completeMut = useMutation({
    mutationFn: () => completeOnboardingSession(sessionId!, companyId),
    onSuccess: () => sessionQ.refetch(),
    onError: (err: Error) => setError(err.message),
  });

  const overrideMut = useMutation({
    mutationFn: () =>
      adminOverrideOnboardingSession(sessionId!, companyId, {
        reason: overrideReason.trim(),
      }),
    onSuccess: () => sessionQ.refetch(),
    onError: (err: Error) => setError(err.message),
  });

  const uploadForStep = useCallback(
    async (step: number, patch: Record<string, unknown>) => {
      setError(null);
      await saveMut.mutateAsync({ step, step_data: patch });
    },
    [saveMut]
  );

  const handleDocUpload = useCallback(
    async (step: number, extra: Record<string, unknown>, file: File) => {
      setUploadingKey(String(step));
      try {
        const uploaded = await uploadDriverDoc(file, driverId);
        await uploadForStep(step, { ...extra, ...uploaded });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingKey(null);
      }
    },
    [driverId, uploadForStep]
  );

  const unitOptions = useMemo(
    () =>
      (unitsQ.data ?? []).map((unit) => {
        const row = unit as { id: string; unit_number?: string };
        return { id: row.id, label: row.unit_number ?? row.id };
      }),
    [unitsQ.data]
  );

  const identity = stepDataFor(session, "identity") as Record<string, string>;
  const cdl = stepDataFor(session, "cdl_upload") as { file_id?: string; file_name?: string };
  const medical = stepDataFor(session, "medical_card") as {
    expires_at?: string;
    file_id?: string;
    file_name?: string;
  };
  const dqf = stepDataFor(session, "dqf_docs") as Record<string, { file_id?: string; file_name?: string }>;
  const signatures = stepDataFor(session, "signatures") as {
    acknowledged?: boolean;
    file_id?: string;
    file_name?: string;
  };
  const i9 = stepDataFor(session, "i9") as {
    section1_completed?: boolean;
    file_id?: string;
    file_name?: string;
  };
  const vehicle = stepDataFor(session, "vehicle_assignment") as { unit_id?: string };

  const canAdvance = useMemo(() => {
    if (activeStep === 0) return Boolean(identity.first_name && identity.last_name && identity.phone);
    if (activeStep === 1) return Boolean(cdl.file_id);
    if (activeStep === 2) return Boolean(medical.file_id && medical.expires_at);
    if (activeStep === 3) return Boolean(dqf.mvr?.file_id);
    if (activeStep === 4) return Boolean(signatures.acknowledged);
    if (activeStep === 5) return Boolean(i9.section1_completed && i9.file_id);
    return true;
  }, [activeStep, identity, cdl, medical, dqf, signatures, i9]);

  const saveAndAdvance = async () => {
    if (!session) return;
    const step = activeStep + 1;
    let payload: Record<string, unknown> = {};
    if (step === 1) payload = identity;
    if (step === 2) payload = cdl;
    if (step === 3) payload = medical;
    if (step === 4) payload = dqf;
    if (step === 5) payload = signatures;
    if (step === 6) payload = i9;
    if (step === 7) payload = vehicle;
    await saveMut.mutateAsync({ step, step_data: payload, advance: true });
    setStepIndex(Math.min(6, step));
  };

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm">Select an operating company.</div>;
  }
  if (!sessionId) {
    return <div className="rounded border bg-white p-4 text-sm">Missing onboarding session.</div>;
  }
  if (sessionQ.isLoading) {
    return <div className="rounded border bg-white p-4 text-sm">Loading onboarding session…</div>;
  }
  if (sessionQ.isError || !session) {
    return <div className="rounded border bg-white p-4 text-sm text-red-700">Onboarding session not found.</div>;
  }

  const completed = session.status === "completed";

  return (
    <div data-testid="onboarding-wizard-page" className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Driver Onboarding Wizard"
        subtitle={`Session ${session.id.slice(0, 8)}… · save + resume · docs module uploads`}
        actions={
          driverId ? (
            <Link to={`/drivers/${driverId}`} className="rounded border px-3 py-1.5 text-sm">
              Driver profile
            </Link>
          ) : null
        }
      />

      {completed ? (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Onboarding {session.admin_override ? "completed with admin override" : "completed"}.
          {session.admin_override_reason ? ` Reason: ${session.admin_override_reason}` : null}
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {ONBOARDING_STEP_LABELS.map((label, idx) => (
            <button
              key={label}
              type="button"
              disabled={completed}
              className={`rounded px-2 py-1 text-xs ${idx === activeStep ? "bg-blue-600 text-white" : "bg-gray-100"}`}
              onClick={() => setStepIndex(idx)}
            >
              {idx + 1}. {label}
            </button>
          ))}
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        {activeStep === 0 ? (
          <OnboardingStepIdentity
            value={identity}
            disabled={completed}
            onChange={(patch) => uploadForStep(1, { ...identity, ...patch })}
          />
        ) : null}
        {activeStep === 1 ? (
          <OnboardingStepCdlUpload
            fileId={cdl.file_id ?? ""}
            fileName={cdl.file_name ?? ""}
            uploading={uploadingKey === "2"}
            disabled={completed}
            onUpload={(file) => handleDocUpload(2, {}, file)}
          />
        ) : null}
        {activeStep === 2 ? (
          <OnboardingStepMedicalCard
            expiresAt={medical.expires_at ?? ""}
            fileId={medical.file_id ?? ""}
            fileName={medical.file_name ?? ""}
            uploading={uploadingKey === "3"}
            disabled={completed}
            onChangeExpiry={(expires_at) => uploadForStep(3, { ...medical, expires_at })}
            onUpload={(file) => handleDocUpload(3, { expires_at: medical.expires_at }, file)}
          />
        ) : null}
        {activeStep === 3 ? (
          <OnboardingStepDqfDocs
            docs={dqf}
            uploadingKey={uploadingKey}
            disabled={completed}
            onUpload={async (key, file) => {
              setUploadingKey(key);
              try {
                const uploaded = await uploadDriverDoc(file, driverId);
                await uploadForStep(4, { ...dqf, [key]: uploaded });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed");
              } finally {
                setUploadingKey(null);
              }
            }}
          />
        ) : null}
        {activeStep === 4 ? (
          <OnboardingStepSignatures
            acknowledged={Boolean(signatures.acknowledged)}
            fileId={signatures.file_id ?? ""}
            fileName={signatures.file_name ?? ""}
            uploading={uploadingKey === "5"}
            disabled={completed}
            onAcknowledge={(acknowledged) => uploadForStep(5, { ...signatures, acknowledged })}
            onUpload={(file) => handleDocUpload(5, { acknowledged: signatures.acknowledged }, file)}
          />
        ) : null}
        {activeStep === 5 ? (
          <OnboardingStepI9
            section1Completed={Boolean(i9.section1_completed)}
            fileId={i9.file_id ?? ""}
            fileName={i9.file_name ?? ""}
            uploading={uploadingKey === "6"}
            disabled={completed}
            onSection1={(section1_completed) => uploadForStep(6, { ...i9, section1_completed })}
            onUpload={(file) => handleDocUpload(6, { section1_completed: i9.section1_completed }, file)}
          />
        ) : null}
        {activeStep === 6 ? (
          <OnboardingStepVehicleAssignment
            unitId={vehicle.unit_id ?? ""}
            unitOptions={unitOptions}
            disabled={completed}
            onChange={(unit_id) => uploadForStep(7, { unit_id })}
          />
        ) : null}

        {!completed ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!canAdvance || saveMut.isPending}
              onClick={() => void saveAndAdvance()}
            >
              Save &amp; continue
            </button>
            {activeStep === 6 ? (
              <button
                type="button"
                className="rounded border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 disabled:opacity-50"
                disabled={completeMut.isPending}
                onClick={() => void completeMut.mutateAsync()}
              >
                Complete onboarding
              </button>
            ) : null}
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm text-amber-700"
              onClick={() => setShowOverride((v) => !v)}
            >
              Admin override
            </button>
          </div>
        ) : null}

        {showOverride && !completed ? (
          <div className="mt-4 space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
            <label className="block text-sm">
              <span className="font-medium">Override reason (required)</span>
              <textarea
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={overrideReason.trim().length < 10 || overrideMut.isPending}
              onClick={() => void overrideMut.mutateAsync()}
            >
              Apply admin override
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
