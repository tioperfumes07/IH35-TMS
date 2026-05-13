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
  const reservationRef = useRef<string | null>(null);
  const bumping = useRef(false);
  const onUpdateRef = useRef(onReservationUpdate);
  onUpdateRef.current = onReservationUpdate;

  const bumpReserve = useCallback(async () => {
    if (bumping.current) return;
    bumping.current = true;
    try {
      const r = await reserveDispatchLoadId(operatingCompanyId);
      reservationRef.current = r.reservation_uuid;
      setDisplay(r);
      onUpdateRef.current(r);
      const until = new Date(r.reserved_until).getTime();
      setSecondsLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    } finally {
      bumping.current = false;
    }
  }, [operatingCompanyId]);

  useEffect(() => {
    void bumpReserve();
    return () => {
      const id = reservationRef.current;
      reservationRef.current = null;
      if (id) {
        void releaseDispatchLoadReservation(operatingCompanyId, id);
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
      <span style={{ color: "#A8B0C7" }}>Load #</span>
      <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs normal-case tracking-normal">
        {display?.load_number ?? "…"}
      </span>
      <span style={{ color: "#6EE7B7" }}>● Reserved</span>
      <span className="ml-auto normal-case tracking-normal" style={{ color: "#A8B0C7" }}>
        {secondsLeft}s
      </span>
    </div>
  );
}
