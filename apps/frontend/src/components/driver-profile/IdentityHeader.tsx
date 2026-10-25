import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "../StatusBadge";
import { MASTER_DETAIL } from "../../design/master-detail";
import { driverDisplayName } from "../../lib/driverDqf";
import { formatPhoneDisplay } from "../../lib/formatPhoneAsTyped";
import {
  clearDriverPhoto,
  listDriverPhotoCandidates,
  setDriverPhotoFromFile,
  uploadAndSetDriverPhoto,
} from "../../api/driver-photos";

export function IdentityHeader({
  driver,
  employmentStatusLabel,
  driverId,
  companyId,
  onPhotoUpdated,
}: {
  driver: Record<string, unknown>;
  /**
   * DRV-04. This header used to read `driver.employment_status` — a RETIRED column with no writer.
   * Verified on prod 2026-07-27 (lucia bypass, positive control mdata.drivers = 178): it is populated
   * on 0 of 178 drivers, while the canonical mdata.drivers.driver_employment_status_id is populated on
   * 178 of 178. So the header silently fell through to pay_basis, or to an em dash, for EVERY driver —
   * the field looked merely blank rather than broken, which is why it survived.
   *
   * The label comes from reference.employment_statuses via the aggregate's reference-FK enrichment.
   * It is passed in rather than read off `driver` because the aggregate exposes it alongside the other
   * reference-FK labels, not on the raw driver row.
   */
  employmentStatusLabel?: string | null;
  /** When provided, enables photo management UI */
  driverId?: string;
  companyId?: string;
  onPhotoUpdated?: () => void;
}) {
  // C-12 / D12 — Proper Case via driverDisplayName (never ALL CAPS / all lowercase raw columns).
  // Do NOT pass driver.id as the display fallback here — verify-entity-link-adoption treats that
  // as an id alias rendered in <h2> and ratchets. Plain "Driver" is the header empty label.
  const displayName = driverDisplayName(
    driver.first_name as string | null | undefined,
    driver.last_name as string | null | undefined,
    "Driver",
  );
  const photoUrl = driver.photo_url ? String(driver.photo_url) : null;
  // Canonical label first; pay_basis remains the pre-existing secondary. The retired column is NOT
  // consulted at all — a value there would be stale by definition, since nothing writes it.
  const employment = employmentStatusLabel
    ? String(employmentStatusLabel)
    : driver.pay_basis
      ? String(driver.pay_basis)
      : "—";

  const canManagePhoto = Boolean(driverId && companyId && onPhotoUpdated);

  return (
    <section className={`${MASTER_DETAIL.surfaceClass} p-4`} data-testid="driver-identity-header">
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E5E7EB] text-page-title font-semibold text-[#4B5563]">
              {displayName.slice(0, 1)}
            </div>
          )}
          {canManagePhoto && (
            <PhotoActions
              driverId={driverId!}
              companyId={companyId!}
              hasPhoto={Boolean(photoUrl)}
              onDone={onPhotoUpdated!}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-page-title font-semibold text-gray-900">{displayName}</h2>
          <p className="text-xs text-gray-600">
            DOB {driver.date_of_birth ? String(driver.date_of_birth) : "—"} · Hired{" "}
            {driver.hire_date ? String(driver.hire_date) : "—"}
          </p>
          <p className="text-xs text-gray-600">
            {employment} · ID {driver.employee_id_display ? String(driver.employee_id_display) : "—"}
          </p>
          <p className="text-xs text-gray-600" data-testid="driver-identity-phone">
            Phone {formatPhoneDisplay(driver.phone as string | null | undefined)}
          </p>
        </div>
        <StatusBadge status={String(driver.status ?? "Active")} />
      </div>
    </section>
  );
}

function PhotoActions({
  driverId,
  companyId,
  hasPhoto,
  onDone,
}: {
  driverId: string;
  companyId: string;
  hasPhoto: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const candidatesQ = useQuery({
    queryKey: ["driver-photo-candidates", driverId, companyId],
    queryFn: () => listDriverPhotoCandidates(driverId, companyId),
    enabled: open,
    staleTime: 30_000,
  });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute -bottom-1 -right-1" data-testid="driver-photo-actions">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] text-gray-500 hover:bg-gray-100"
        aria-label="Change photo"
        title="Change photo"
        data-testid="driver-photo-actions-toggle"
      >
        ✎
      </button>
      {open && (
        <div
          className="absolute right-0 top-6 z-50 min-w-[200px] rounded-sm border border-gray-200 bg-white py-1 shadow-md"
          data-testid="driver-photo-actions-menu"
        >
          <p className="px-3 py-1 text-xs font-semibold uppercase text-gray-500">Photo</p>
          {/* Upload new */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="driver-photo-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(() => uploadAndSetDriverPhoto(driverId, companyId, file));
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50"
            data-testid="driver-photo-upload-btn"
          >
            Upload new photo
          </button>
          {/* Pick from ID docs */}
          {candidatesQ.data && candidatesQ.data.length > 0 && (
            <>
              <p className="mt-1 border-t border-gray-100 px-3 py-1 text-xs text-gray-500">From ID documents</p>
              {candidatesQ.data.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setDriverPhotoFromFile(driverId, companyId, c.id))}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                  data-testid={`driver-photo-candidate-${c.id}`}
                >
                  {c.signed_url ? (
                    <img src={c.signed_url} alt="" className="h-8 w-8 rounded-sm object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-sm bg-gray-100" />
                  )}
                  <span className="flex-1 truncate">{c.original_filename}</span>
                </button>
              ))}
            </>
          )}
          {candidatesQ.isLoading && (
            <p className="px-3 py-1.5 text-xs text-gray-400">Loading ID docs…</p>
          )}
          {/* Remove */}
          {hasPhoto && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => clearDriverPhoto(driverId, companyId))}
                className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-gray-50"
                data-testid="driver-photo-remove-btn"
              >
                Remove photo
              </button>
            </>
          )}
          {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-500"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
