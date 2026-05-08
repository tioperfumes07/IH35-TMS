import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { listFileCategories } from "../api/docs";
import { getCurrentDriver } from "../api/mdata";
import { compressImage } from "../lib/image-compress";
import { enqueueUpload, type UploadQueueItem } from "../lib/upload-queue";
import { syncOnce } from "../lib/upload-sync";
import { Modal } from "./Modal";
import { PwaButton } from "./PwaButton";
import { useToast } from "./Toast";

type UploadDocumentModalProps = {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
  defaultEntityType?: "driver" | "standalone" | "load_stop";
  defaultEntityId?: string | null;
  allowedCategoryCodes?: string[];
  title?: string;
};

const QUICK_CODES = ["cdl", "medical_card", "dot_inspection", "dvir", "bol", "pod", "lumper_receipt", "damage_photo", "other"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function UploadDocumentModal({
  open,
  onClose,
  onQueued,
  defaultEntityType = "driver",
  defaultEntityId = null,
  allowedCategoryCodes,
  title = "Upload Document",
}: UploadDocumentModalProps) {
  const { pushToast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showOtherCategories, setShowOtherCategories] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<"driver" | "standalone" | "load_stop">(defaultEntityType);
  const [submitting, setSubmitting] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["driver-pwa-file-categories"],
    queryFn: () => listFileCategories("driver").then((result) => result.categories.filter((category) => category.is_active)),
    enabled: open,
  });

  const driverQuery = useQuery({
    queryKey: ["driver-pwa-self-driver-record"],
    queryFn: getCurrentDriver,
    enabled: open,
  });

  const filteredCategories = useMemo(() => {
    const all = categoriesQuery.data ?? [];
    if (!allowedCategoryCodes || allowedCategoryCodes.length === 0) return all;
    return all.filter((category) => allowedCategoryCodes.includes(category.code));
  }, [allowedCategoryCodes, categoriesQuery.data]);

  const quickCategories = useMemo(() => {
    const byCode = new Map(filteredCategories.map((category) => [category.code, category]));
    return QUICK_CODES.map((code) => byCode.get(code)).filter(Boolean);
  }, [filteredCategories]);

  const otherCategories = useMemo(
    () => filteredCategories.filter((category) => !QUICK_CODES.includes(category.code)),
    [filteredCategories]
  );

  const selectedCategory = useMemo(
    () => filteredCategories.find((category) => category.id === categoryId) ?? null,
    [filteredCategories, categoryId]
  );

  function resetAndClose() {
    setStep(1);
    setFile(null);
    setCategoryId(null);
    setShowOtherCategories(false);
    setDetailsOpen(false);
    setDocumentDate(todayIso());
    setExpirationDate("");
    setDescription("");
    setEntityType(defaultEntityType);
    setSubmitting(false);
    onClose();
  }

  async function handleQueueUpload() {
    if (!file) {
      pushToast("Select a file first", "error");
      return;
    }
    if (!categoryId) {
      pushToast("Choose a category", "error");
      return;
    }
    if (selectedCategory?.requires_expiration_date && !expirationDate) {
      pushToast("Expiration date is required for this category", "error");
      return;
    }

    const driverId = driverQuery.data?.id ?? null;
    if (entityType === "driver" && (!driverId || !isUuid(driverId))) {
      pushToast("Your account is not linked to a driver profile. Contact dispatch.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const optimizedFile = await compressImage(file, 1920, 0.8);
      const item: UploadQueueItem = {
        id: crypto.randomUUID(),
        file_blob: optimizedFile,
        mime_type: optimizedFile.type || "application/octet-stream",
        original_filename: optimizedFile.name,
        size_bytes: optimizedFile.size,
        category_id: categoryId,
        entity_type: entityType,
        entity_id: entityType === "driver" ? driverId : defaultEntityId,
        document_date: documentDate || null,
        expiration_date: expirationDate || null,
        description: description.trim() || null,
        retry_count: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        status: "pending",
        next_retry_at: null,
      };
      await enqueueUpload(item);
      onQueued();
      void syncOnce();
      pushToast("Uploading in background — view in My Documents", "success");
      resetAndClose();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to queue upload", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={title}>
      <div className="space-y-4">
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-pwa-text-secondary">Step 1: Pick file</p>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                if (!picked) return;
                setFile(picked);
                setStep(2);
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                if (!picked) return;
                setFile(picked);
                setStep(2);
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <PwaButton className="min-h-16" onClick={() => cameraInputRef.current?.click()}>
                Camera Capture
              </PwaButton>
              <PwaButton variant="secondary" className="min-h-16" onClick={() => fileInputRef.current?.click()}>
                Pick File
              </PwaButton>
            </div>
          </div>
        ) : null}

        {step >= 2 ? (
          <div className="space-y-3">
            <p className="text-sm text-pwa-text-secondary">Step 2: Category quick-pick</p>
            {file ? (
              <div className="rounded-xl border border-pwa-border bg-[#1A2030] p-2 text-xs text-pwa-text-secondary">
                {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {quickCategories.map((category) => (
                <PwaButton
                  key={category?.id}
                  variant={categoryId === category?.id ? "primary" : "secondary"}
                  className="min-h-14"
                  onClick={() => {
                    if (!category) return;
                    if (category.code === "other") {
                      setShowOtherCategories((current) => !current);
                    }
                    setCategoryId(category.id);
                    setStep(3);
                  }}
                >
                  {category?.label}
                </PwaButton>
              ))}
            </div>
            {showOtherCategories ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-pwa-text-secondary">Other categories</label>
                <select
                  value={categoryId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setCategoryId(value);
                    setStep(3);
                  }}
                  className="h-10 w-full rounded-lg border border-pwa-border bg-pwa-card px-2 text-sm text-pwa-text-primary"
                >
                  <option value="">Select category</option>
                  {otherCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {step >= 3 ? (
          <div className="space-y-3">
            <p className="text-sm text-pwa-text-secondary">Step 3: Optional details</p>
            {defaultEntityType === "load_stop" ? null : (
              <div className="grid grid-cols-2 gap-2">
                <PwaButton variant={entityType === "driver" ? "primary" : "secondary"} className="min-h-12" onClick={() => setEntityType("driver")}>
                  Attach to me
                </PwaButton>
                <PwaButton
                  variant={entityType === "standalone" ? "primary" : "secondary"}
                  className="min-h-12"
                  onClick={() => setEntityType("standalone")}
                >
                  Standalone
                </PwaButton>
              </div>
            )}
            <button
              type="button"
              className="w-full rounded-xl border border-pwa-border px-3 py-2 text-left text-sm text-pwa-text-secondary"
              onClick={() => setDetailsOpen((current) => !current)}
            >
              Add details {detailsOpen ? "▴" : "▾"}
            </button>
            {detailsOpen ? (
              <div className="space-y-2 rounded-xl border border-pwa-border bg-[#1A2030] p-3">
                <label className="block text-xs text-pwa-text-secondary">
                  Document date
                  <input
                    type="date"
                    value={documentDate}
                    onChange={(event) => setDocumentDate(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-pwa-border bg-pwa-card px-2 text-sm text-pwa-text-primary"
                  />
                </label>
                <label className="block text-xs text-pwa-text-secondary">
                  Expiration date {selectedCategory?.requires_expiration_date ? "(required)" : ""}
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(event) => setExpirationDate(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-pwa-border bg-pwa-card px-2 text-sm text-pwa-text-primary"
                  />
                </label>
                <label className="block text-xs text-pwa-text-secondary">
                  Description
                  <input
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-pwa-border bg-pwa-card px-2 text-sm text-pwa-text-primary"
                    placeholder="Optional note"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {step >= 4 ? null : (
          <div className="flex gap-2">
            {step > 1 ? (
              <PwaButton
                variant="secondary"
                className="flex-1"
                onClick={() =>
                  setStep((current) => {
                    const previous = current - 1;
                    if (previous <= 1) return 1;
                    if (previous === 2) return 2;
                    if (previous === 3) return 3;
                    return 4;
                  })
                }
              >
                Back
              </PwaButton>
            ) : null}
            <PwaButton
              className="flex-1"
              onClick={() => {
                if (step < 3) {
                  setStep((current) => (current + 1) as 1 | 2 | 3 | 4);
                } else {
                  setStep(4);
                }
              }}
              disabled={(step === 1 && !file) || (step === 2 && !categoryId)}
            >
              {step < 3 ? "Next" : "Continue"}
            </PwaButton>
          </div>
        )}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-pwa-text-secondary">Step 4: Submit</p>
            {entityType === "driver" && driverQuery.isLoading ? (
              <p className="text-xs text-pwa-text-secondary">Loading your driver profile...</p>
            ) : null}
            {entityType === "driver" && driverQuery.error ? (
              <p className="text-xs text-hos-violation">
                {driverQuery.error instanceof ApiError && driverQuery.error.status === 404
                  ? "Your account is not linked to a driver profile. Contact dispatch."
                  : "Unable to load your driver profile. Try again."}
              </p>
            ) : null}
            <PwaButton
              className="w-full"
              onClick={() => void handleQueueUpload()}
              disabled={
                submitting ||
                (entityType === "driver" && (driverQuery.isLoading || Boolean(driverQuery.error) || !driverQuery.data?.id))
              }
            >
              {submitting ? "Optimizing..." : "Queue Upload"}
            </PwaButton>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
