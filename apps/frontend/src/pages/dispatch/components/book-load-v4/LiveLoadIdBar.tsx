import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../api/client";
import { releaseDispatchLoadReservation, reserveDispatchLoadId } from "../../../../api/dispatch";
import { QboDocumentNumberField } from "../../../../components/forms/QboDocumentNumberField";

export type LiveReservation = {
  reservation_uuid: string;
  load_number: string;
  reserved_until: string;
  ttl_seconds: number;
};

type Props = {
  operatingCompanyId: string;
  onReservationUpdate: (r: LiveReservation | null) => void;
};

const FIRST_LOAD_REQUIRED = "first_load_number_required";

function apiErrorCode(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.data;
    if (payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string") {
      return String((payload as { error: string }).error);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "";
}

function isFirstLoadNumberRequired(err: unknown): boolean {
  const code = apiErrorCode(err);
  return code === FIRST_LOAD_REQUIRED || code.includes(FIRST_LOAD_REQUIRED);
}

export function LiveLoadIdBar({ operatingCompanyId, onReservationUpdate }: Props) {
  const [display, setDisplay] = useState<LiveReservation | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const manualNumberRef = useRef("");
  manualNumberRef.current = manualNumber;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [awaitingFirstNumber, setAwaitingFirstNumber] = useState(false);
  const reservationRef = useRef<{ companyId: string; reservationId: string } | null>(null);
  const scopeGenerationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onReservationUpdate);
  onUpdateRef.current = onReservationUpdate;

  const publishTypedNumber = useCallback((next: string) => {
    const current = reservationRef.current;
    onUpdateRef.current({
      reservation_uuid: current?.reservationId ?? "",
      load_number: next,
      reserved_until: new Date(Date.now() + 60_000).toISOString(),
      ttl_seconds: 60,
    });
  }, []);

  const bumpReserve = useCallback(async () => {
    const submittedGeneration = scopeGenerationRef.current;
    const submittedCompanyId = operatingCompanyId;
    if (activeGenerationRef.current === submittedGeneration) return;
    activeGenerationRef.current = submittedGeneration;
    setError(null);
    try {
      const currentReservation = reservationRef.current;
      const renewalId = currentReservation?.companyId === submittedCompanyId
        ? currentReservation.reservationId
        : undefined;
      const r = await reserveDispatchLoadId(submittedCompanyId, renewalId);
      if (scopeGenerationRef.current !== submittedGeneration) {
        await releaseDispatchLoadReservation(submittedCompanyId, r.reservation_uuid).catch(() => undefined);
        return;
      }
      reservationRef.current = { companyId: submittedCompanyId, reservationId: r.reservation_uuid };
      setAwaitingFirstNumber(false);
      setDisplay(r);
      onUpdateRef.current({ ...r, load_number: manualNumberRef.current.trim() });
      const until = new Date(r.reserved_until).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    } catch (err) {
      if (scopeGenerationRef.current !== submittedGeneration) return;
      reservationRef.current = null;
      setDisplay(null);
      setSecondsLeft(0);
      if (isFirstLoadNumberRequired(err)) {
        setAwaitingFirstNumber(true);
        setError(null);
        publishTypedNumber(manualNumberRef.current.trim());
        return;
      }
      setError(apiErrorCode(err) || "Could not reserve a load number");
      publishTypedNumber(manualNumberRef.current.trim());
    } finally {
      if (activeGenerationRef.current === submittedGeneration) activeGenerationRef.current = null;
    }
  }, [operatingCompanyId, publishTypedNumber]);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    activeGenerationRef.current = null;
    reservationRef.current = null;
    setDisplay(null);
    setSecondsLeft(0);
    setError(null);
    setAwaitingFirstNumber(false);
    onUpdateRef.current(null);
    void bumpReserve();
    return () => {
      scopeGenerationRef.current += 1;
      activeGenerationRef.current = null;
      const reservation = reservationRef.current;
      reservationRef.current = null;
      if (reservation) {
        void releaseDispatchLoadReservation(reservation.companyId, reservation.reservationId);
      }
    };
  }, [bumpReserve, operatingCompanyId]);

  useEffect(() => {
    if (!display || awaitingFirstNumber) return;
    const timer = window.setInterval(() => {
      const until = new Date(display.reserved_until).getTime();
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        void bumpReserve();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [awaitingFirstNumber, bumpReserve, display]);

  return (
    <div
      className="flex items-end gap-4 px-4 py-2 text-[10px] font-semibold tracking-wide text-white"
      style={{ background: "#0F1320" }}
    >
      <div className="min-w-[14rem] rounded-sm bg-white px-2 py-1 text-left normal-case tracking-normal text-slate-900">
        <QboDocumentNumberField
          label="Load #"
          value={manualNumber}
          onChange={(next) => {
            setManualNumber(next);
            publishTypedNumber(next);
          }}
          operatingCompanyId={operatingCompanyId}
          nextNumberPath={awaitingFirstNumber ? undefined : "/api/v1/dispatch/loads/next-number"}
          checkPath={awaitingFirstNumber ? undefined : "/api/v1/dispatch/loads/next-number"}
          fieldName="load"
          autoFocus={awaitingFirstNumber}
          hint={
            awaitingFirstNumber
              ? "Click this white box and type the first number (example 13508). Grey hint text is not the number."
              : undefined
          }
          data-testid="qbo-document-number-load"
        />
      </div>
      {awaitingFirstNumber ? (
        <span className="normal-case font-normal tracking-normal" style={{ color: "#A8B0C7" }}>
          First load for this company — type the Load # in the box. Later loads can stay blank.
        </span>
      ) : error ? (
        <>
          <span className="normal-case tracking-normal text-red-200">Load number unavailable: {error}</span>
          <button type="button" className="rounded-sm border border-white/30 px-2 py-1 normal-case" onClick={() => void bumpReserve()}>
            Retry
          </button>
        </>
      ) : (
        <>
          <span style={{ color: display ? "#6EE7B7" : "#A8B0C7" }}>{display ? "● Reserved" : "Reserving…"}</span>
          <span className="ml-auto normal-case tracking-normal" style={{ color: "#A8B0C7" }}>
            {secondsLeft}s
          </span>
        </>
      )}
    </div>
  );
}
