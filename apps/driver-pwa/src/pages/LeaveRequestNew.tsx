import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { confirmUpload, listFileCategories, requestUploadUrl, uploadBlobToR2 } from "../api/docs";
import { getCurrentDriver } from "../api/mdata";
import { createLeaveRequest } from "../api/scheduler";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

type LeaveType = "vacation" | "sick" | "personal" | "wfh";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysInclusive(startIso: string, endIso: string): number {
  const [ys, ms, ds] = startIso.split("-").map(Number);
  const [ye, me, de] = endIso.split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds);
  const b = Date.UTC(ye, me - 1, de);
  return Math.floor((b - a) / 86_400_000) + 1;
}

async function uploadSickDocument(file: File, driverId: string): Promise<string> {
  const { categories } = await listFileCategories("driver");
  const active = categories.filter((c) => c.is_active);
  const cat =
    active.find((c) => c.code === "medical_card") ?? active.find((c) => c.code === "other") ?? active[0];
  if (!cat) throw new Error("no_category");
  const init = await requestUploadUrl({
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    category_id: cat.id,
    entity_links: [{ entity_type: "driver", entity_id: driverId }],
  });
  await uploadBlobToR2(init.presigned_url, file, file.type || "application/octet-stream");
  await confirmUpload(init.file_id);
  return init.file_id;
}

export function LeaveRequestNewPage() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [leaveType, setLeaveType] = useState<LeaveType | null>(null);
  const [startDate, setStartDate] = useState(utcToday());
  const [endDate, setEndDate] = useState(utcToday());
  const [reason, setReason] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [coverRaw, setCoverRaw] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!leaveType) throw new Error("type");
      const body: Parameters<typeof createLeaveRequest>[0] = {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      };
      const cover = coverRaw.trim();
      if (UUID_RE.test(cover)) body.suggested_cover_driver_id = cover;
      if (attachmentId) body.documentation_attachment_id = attachmentId;
      return createLeaveRequest(body);
    },
    onSuccess: () => {
      pushToast(t("scheduler.submitted_ok"), "success");
      navigate("/scheduler/requests");
    },
    onError: (err) => {
      if (err instanceof ApiError && typeof err.data === "object" && err.data !== null) {
        const code = (err.data as { error?: string }).error;
        if (code === "leave_sick_doc_required") {
          pushToast(t("scheduler.sick_doc_required"), "error");
          return;
        }
        if (code === "leave_vacation_advance_notice" || code === "leave_personal_advance_notice") {
          pushToast(t("scheduler.notice_blocked"), "error");
          return;
        }
      }
      pushToast(t("scheduler.submit_failed"), "error");
    },
  });

  const span = daysInclusive(startDate, endDate);
  const sickNeedsDoc = leaveType === "sick" && span > 1;

  async function handleNextFromReason() {
    if (!reason.trim()) {
      pushToast(t("scheduler.reason_required"), "error");
      return;
    }
    if (sickNeedsDoc) {
      if (!docFile) {
        pushToast(t("scheduler.pick_document"), "error");
        return;
      }
      setUploadingDoc(true);
      try {
        const me = await getCurrentDriver();
        const id = await uploadSickDocument(docFile, me.id);
        setAttachmentId(id);
      } catch {
        pushToast(t("scheduler.upload_failed"), "error");
        setUploadingDoc(false);
        return;
      }
      setUploadingDoc(false);
    }
    setStep(4);
  }

  function renderStep() {
    if (step === 1) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-pwa-text-secondary">{t("scheduler.step_type_hint")}</p>
          {(["vacation", "sick", "personal", "wfh"] as const).map((k) => (
            <PwaButton
              key={k}
              type="button"
              variant={leaveType === k ? "primary" : "secondary"}
              className="w-full justify-start"
              onClick={() => setLeaveType(k)}
            >
              {t(`scheduler.leave_type.${k}`)}
            </PwaButton>
          ))}
          <PwaButton type="button" className="mt-2 w-full" disabled={!leaveType} onClick={() => setStep(2)}>
            {t("scheduler.next")}
          </PwaButton>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div className="flex flex-col gap-3">
          <label className="block text-xs font-semibold text-pwa-text-secondary">
            {t("scheduler.start_date")}
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-pwa-text-secondary">
            {t("scheduler.end_date")}
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <PwaButton
            type="button"
            className="w-full"
            onClick={() => {
              if (daysInclusive(startDate, endDate) < 1 || endDate < startDate) {
                pushToast(t("scheduler.invalid_range"), "error");
                return;
              }
              setStep(3);
            }}
          >
            {t("scheduler.next")}
          </PwaButton>
        </div>
      );
    }
    if (step === 3) {
      return (
        <div className="flex flex-col gap-3">
          <label className="block text-xs font-semibold text-pwa-text-secondary">
            {t("scheduler.reason")}
            <textarea
              className="mt-1 min-h-[100px] w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {sickNeedsDoc ? (
            <label className="block text-xs font-semibold text-pwa-text-secondary">
              {t("scheduler.sick_doc_label")}
              <input
                type="file"
                className="mt-1 w-full text-sm text-pwa-text-primary"
                accept="image/*,application/pdf"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
          <PwaButton type="button" className="w-full" disabled={uploadingDoc} onClick={() => void handleNextFromReason()}>
            {uploadingDoc ? t("common.loading") : t("scheduler.next")}
          </PwaButton>
        </div>
      );
    }
    if (step === 4) {
      return (
        <div className="flex flex-col gap-3">
          <label className="block text-xs font-semibold text-pwa-text-secondary">
            {t("scheduler.suggest_cover")}
            <input
              type="text"
              inputMode="text"
              placeholder="uuid"
              className="mt-1 w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 font-mono text-xs text-pwa-text-primary"
              value={coverRaw}
              onChange={(e) => setCoverRaw(e.target.value)}
            />
          </label>
          <PwaButton type="button" className="w-full" onClick={() => setStep(5)}>
            {t("scheduler.next")}
          </PwaButton>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 text-sm text-pwa-text-secondary">
        <p>
          <span className="text-pwa-text-primary">{t(`scheduler.leave_type.${leaveType!}`)}</span> · {startDate} → {endDate}
        </p>
        <p>{reason}</p>
        <PwaButton type="button" className="w-full" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
          {submitMut.isPending ? t("common.loading") : t("scheduler.submit")}
        </PwaButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-3 py-3 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Link to="/scheduler" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("scheduler.back_schedule")}
        </Link>
        <h1 className="text-lg font-semibold text-pwa-text-primary">{t("scheduler.request_flow_title")}</h1>
        <PwaCard title={t("scheduler.step_n", { n: step, max: 5 })}>{renderStep()}</PwaCard>
      </div>
    </div>
  );
}
