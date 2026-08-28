import { useCallback, useEffect, useRef, useState } from "react";
import { releaseDispatchLoadReservation, reserveDispatchLoadId } from "../../../../api/dispatch";

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

export function LiveLoadIdBar({ operatingCompanyId, onReservationUpdate }: Props) {
  const [display, setDisplay] = useState<LiveReservation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reservationRef = useRef<{ companyId: string; reservationId: string } | null>(null);
  const scopeGenerationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onReservationUpdate);
  onUpdateRef.current = onReservationUpdate;

  const bumpReserve = useCallback(async () => {
    const submittedGeneration = scopeGenerationRef.current;
    const submittedCompanyId = operatingCompanyId;
    if (activeGenerationRef.current === submittedGeneration) return;
    activeGenerationRef.current = submittedGeneration;
    setError(null);
    try {
      const r = await reserveDispatchLoadId(submittedCompanyId);
      if (scopeGenerationRef.current !== submittedGeneration) {
        await releaseDispatchLoadReservation(submittedCompanyId, r.reservation_uuid).catch(() => undefined);
        return;
      }
      reservationRef.current = { companyId: submittedCompanyId, reservationId: r.reservation_uuid };
      setDisplay(r);
      onUpdateRef.current(r);
      const until = new Date(r.reserved_until).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    } catch (err) {
      if (scopeGenerationRef.current === submittedGeneration) {
        setDisplay(null);
        setSecondsLeft(0);
        onUpdateRef.current(null);
        setError(err instanceof Error ? err.message : "Could not reserve a load number");
      }
    } finally {
      if (activeGenerationRef.current === submittedGeneration) activeGenerationRef.current = null;
    }
  }, [operatingCompanyId]);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    activeGenerationRef.current = null;
    reservationRef.current = null;
    setDisplay(null);
    setSecondsLeft(0);
    setError(null);
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
    if (!display) return;
    const timer = window.setInterval(() => {
      const until = new Date(display.reserved_until).getTime();
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        void bumpReserve();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bumpReserve, display]);

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: "#0F1320" }}
    >
      {error ? (
        <>
          <span className="normal-case tracking-normal text-red-200">Load number unavailable: {error}</span>
          <button type="button" className="ml-auto rounded-sm border border-white/30 px-2 py-1 normal-case" onClick={() => void bumpReserve()}>
            Retry
          </button>
        </>
      ) : (
        <>
          <span style={{ color: "#A8B0C7" }}>Load #</span>
          <span className="rounded-sm border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs normal-case tracking-normal">
            {display?.load_number ?? "…"}
          </span>
          <span style={{ color: display ? "#6EE7B7" : "#A8B0C7" }}>{display ? "● Reserved" : "Reserving…"}</span>
          <span className="ml-auto normal-case tracking-normal" style={{ color: "#A8B0C7" }}>
            {secondsLeft}s
          </span>
        </>
      )}
    </div>
  );
}
