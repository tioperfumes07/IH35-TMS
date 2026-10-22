import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getDriver } from "../../../api/mdata";
import { getDriverProfileSamsara, getDriverProfileAssignments } from "../../../api/driver-profile-tabs";
import { getDriverHosDetail } from "../../../api/hos";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell } from "../ModBoardShell";
import { TractorTopView } from "../TractorTopView";
import { bodyStyleFromMakeModel } from "../bodyStyle";
import { formatNumber, formatUsdCents } from "../format";
import { getDriverHero } from "../api";

type Props = { companyId: string; driverId: string };

function missing(label: string, value: string | null | undefined): string {
  if (value == null || value === "") return "Missing / not on file";
  return value;
}

/**
 * ROUND 443.246 — Driver profile hero (LEAD-FIN-DESIGN-DriverProfile).
 * Prefers GET /drivers/:id/hero; falls back to profile + Samsara + HOS.
 */
export function DriverHeroBoard({ companyId, driverId }: Props) {
  const apiQ = useQuery({
    queryKey: ["mod-graphics", "driver-hero", companyId, driverId],
    queryFn: () => getDriverHero(companyId, driverId),
    enabled: Boolean(companyId && driverId),
    retry: false,
  });

  const drvQ = useQuery({
    queryKey: ["mod-graphics", "driver", companyId, driverId],
    queryFn: () => getDriver(driverId, companyId),
    enabled: Boolean(companyId && driverId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });
  const samQ = useQuery({
    queryKey: ["mod-graphics", "driver-samsara", companyId, driverId],
    queryFn: () => getDriverProfileSamsara(companyId, driverId),
    enabled: Boolean(companyId && driverId),
    retry: false,
  });
  const assignQ = useQuery({
    queryKey: ["mod-graphics", "driver-assign", companyId, driverId],
    queryFn: () => getDriverProfileAssignments(companyId, driverId),
    enabled: Boolean(companyId && driverId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });
  const hosQ = useQuery({
    queryKey: ["mod-graphics", "driver-hos", companyId, driverId],
    queryFn: () => getDriverHosDetail(driverId, companyId),
    enabled: Boolean(companyId && driverId),
    retry: false,
  });

  const hero = apiQ.data;
  const driver = drvQ.data;
  const joinedName = [driver?.first_name, driver?.last_name].filter(Boolean).join(" ");
  const name = hero?.display_name ?? (joinedName || "Driver");

  const openAssign = (assignQ.data?.assignments ?? []).find((a) => !a.ended_at) ?? assignQ.data?.assignments?.[0];
  const unitNumber = hero?.unit?.unit_number ?? openAssign?.unit_number ?? null;
  const make = hero?.unit?.make ?? null;
  const model = hero?.unit?.model ?? null;
  const body = hero?.unit?.body_style ?? bodyStyleFromMakeModel(make, model);

  const pos = hero?.position;
  const samPos = (samQ.data as { latest_position?: { city?: string; state?: string; speed_mph?: number; captured_at?: string } } | undefined)
    ?.latest_position;
  const city = pos?.city ?? samPos?.city ?? null;
  const state = pos?.state ?? samPos?.state ?? null;
  const speed = pos?.speed_mph ?? samPos?.speed_mph ?? null;
  const captured = pos?.captured_at ?? samPos?.captured_at ?? null;
  const moving = speed != null && speed > 3;

  const docs = hero?.docs;
  const cdl = docs?.cdl_expires_at ?? driver?.cdl_expires_at ?? null;
  const medical = docs?.dot_medical_expires_at ?? driver?.dot_medical_expires_at ?? null;
  const visa =
    docs?.visa_expires_at ??
    (driver as { b1_visa_expires_at?: string | null } | undefined)?.b1_visa_expires_at ??
    null;
  const emergencyJoined = [driver?.emergency_contact_name, driver?.emergency_contact_phone_primary]
    .filter(Boolean)
    .join(" · ");
  const emergency = docs?.emergency_contact ?? (emergencyJoined || null);

  const hos = hero?.hos;
  const hosRaw = hosQ.data as {
    drive_remaining_minutes?: number | null;
    shift_remaining_minutes?: number | null;
    cycle_remaining_minutes?: number | null;
  } | undefined;
  const driveMin = hos?.drive_remaining_min ?? hosRaw?.drive_remaining_minutes ?? null;
  const shiftMin = hos?.shift_remaining_min ?? hosRaw?.shift_remaining_minutes ?? null;
  const cycleMin = hos?.cycle_remaining_min ?? hosRaw?.cycle_remaining_minutes ?? null;

  const preCents = hero?.pre_settlement?.open_cents ?? null;
  const status = hero?.status ?? driver?.status ?? null;
  const payBasis = hero?.pay_basis ?? (driver as { pay_basis?: string | null } | undefined)?.pay_basis ?? null;

  return (
    <ModBoardShell
      eyebrow="Driver · USMCA · live"
      title={name}
      subtitle="Hero strip — unit, road, HOS, documents, pre-settlement"
      testId="driver-hero-board"
    >
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] p-2">
          <TractorTopView
            bodyStyle={body}
            cabColor="#14213D"
            moving={moving}
            size={96}
            unitLabel={unitNumber ?? undefined}
          />
          <div className="min-w-0">
            <div className="font-[family-name:var(--mod-font-cond)] text-page-title font-semibold text-[var(--mod-navy)]">
              {unitNumber ? `Unit ${unitNumber}` : "No unit assigned"}
            </div>
            <div className="text-xs text-[var(--mod-muted)]">
              {[make, model].filter(Boolean).join(" ") || "Make/model —"}
            </div>
            <div className="mt-1 font-[family-name:var(--mod-mono)] text-xs text-[var(--mod-navy)]">
              {speed != null ? `${formatNumber(speed, 0)} mph` : "— mph"}
              {" · "}
              {[city, state].filter(Boolean).join(", ") || "Location —"}
            </div>
            <div className="text-section-header text-[var(--mod-muted)]">
              {captured ? `GPS ${captured}` : "GPS —"}
            </div>
          </div>
        </div>

        <div className="mod-board__kpi-grid min-w-[240px] flex-1">
          <ClickableStat
            label="Status"
            value={status ?? "—"}
            to={`/drivers/${driverId}`}
            testId="driver-hero-status"
          />
          <ClickableStat
            label="Pay basis"
            value={payBasis ?? "—"}
            to={`/drivers/${driverId}?tab=pay-escrow`}
            testId="driver-hero-pay"
          />
          <ClickableStat
            label="Drive left"
            value={driveMin == null ? "—" : `${formatNumber(driveMin / 60, 1)} h`}
            to={`/drivers/${driverId}?tab=eld-edits`}
            testId="driver-hero-hos-drive"
          />
          <ClickableStat
            label="Pre-settlement"
            value={preCents == null ? "—" : formatUsdCents(preCents)}
            to={`/drivers/pre-settlements?driver_id=${driverId}`}
            testId="driver-hero-presettle"
          />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3" data-testid="driver-hero-docs">
        <DocCard label="CDL expires" value={missing("CDL", cdl?.slice?.(0, 10) ?? cdl)} to={`/drivers/${driverId}?tab=documents`} />
        <DocCard label="DOT medical" value={missing("Medical", medical?.slice?.(0, 10) ?? medical)} to={`/drivers/${driverId}?tab=documents`} />
        <DocCard label="Visa" value={missing("Visa", visa?.slice?.(0, 10) ?? visa)} to={`/drivers/${driverId}?tab=documents`} />
        <DocCard
          label="DQ file"
          value={
            docs?.dq_file_on_paper === true ||
            (driver as { dq_file_on_paper?: boolean } | undefined)?.dq_file_on_paper
              ? "On paper"
              : "Missing / not on file"
          }
          to={`/drivers/${driverId}?tab=documents`}
        />
        <DocCard label="Emergency contact" value={missing("Emergency", emergency)} to={`/drivers/${driverId}?tab=documents`} />
        <DocCard
          label="HOS shift / cycle"
          value={
            shiftMin == null && cycleMin == null
              ? "—"
              : `${shiftMin == null ? "—" : formatNumber(shiftMin / 60, 1)} h / ${
                  cycleMin == null ? "—" : formatNumber(cycleMin / 60, 1)
                } h`
          }
          to={`/drivers/${driverId}?tab=eld-edits`}
        />
      </div>

      {hero?.loads?.in_motion || (hero?.loads?.booked_ahead?.length ?? 0) > 0 ? (
        <div className="rounded-sm border border-[var(--mod-border)] p-2" data-testid="driver-hero-loads">
          <div className="text-section-header font-bold uppercase text-[var(--mod-muted)]">Trip line</div>
          {hero.loads?.in_motion ? (
            <Link
              className="mod-view-all block"
              to={`/dispatch/loads/${hero.loads.in_motion.load_id}`}
              data-mod-click-through="1"
            >
              Now · load {hero.loads.in_motion.load_number}
            </Link>
          ) : (
            <div className="text-xs text-[var(--mod-muted)]">Now · no in-motion load</div>
          )}
          {(hero.loads?.booked_ahead ?? []).map((l) => (
            <Link
              key={l.load_id}
              className="mod-view-all block"
              to={`/dispatch/loads/${l.load_id}`}
              data-mod-click-through="1"
            >
              Booked · load {l.load_number}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mod-board__sub" data-testid="driver-hero-loads-empty">
          Trip line fills when the load service returns in-motion / booked-ahead rows for this driver.
        </p>
      )}
    </ModBoardShell>
  );
}

function DocCard({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] px-2 py-1.5 no-underline text-inherit hover:border-[var(--mod-navy)]"
      data-mod-click-through="1"
    >
      <div className="text-section-header font-bold uppercase text-[var(--mod-muted)]">{label}</div>
      <div className="text-xs font-semibold text-[var(--mod-navy)]">{value}</div>
    </Link>
  );
}
