import { useCallback, useEffect, useRef, useState } from "react";

const LS_PREFIX = "ih35.modalSize.";

export type UseResizableModalOpts = {
  enabled: boolean;
  modalKey: string;
  minWidth?: number;
  minHeight?: number;
  defaultWidth?: number;
  defaultHeight?: number;
};

type Stored = { w: number; h: number };

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { w?: number; h?: number };
    if (typeof j.w === "number" && typeof j.h === "number") return { w: j.w, h: j.h };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * SE-corner drag resize for modal panels; persists {w,h} in localStorage.
 */
export function useResizableModal(opts: UseResizableModalOpts) {
  const { enabled, modalKey, minWidth = 320, minHeight = 240, defaultWidth = 880, defaultHeight = 640 } = opts;
  const storageKey = `${LS_PREFIX}${modalKey}`;

  const [size, setSize] = useState<Stored>({ w: defaultWidth, h: defaultHeight });
  const live = useRef<Stored>({ w: defaultWidth, h: defaultHeight });
  const drag = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const fromLs = parseStored(localStorage.getItem(storageKey));
    const w0 = fromLs?.w ?? Math.min(defaultWidth, window.innerWidth - 32);
    const h0 = fromLs?.h ?? Math.min(defaultHeight, window.innerHeight - 32);
    const next = {
      w: Math.max(minWidth, Math.min(w0, window.innerWidth - 24)),
      h: Math.max(minHeight, Math.min(h0, window.innerHeight - 24)),
    };
    live.current = next;
    setSize(next);
  }, [enabled, storageKey, minWidth, minHeight, defaultWidth, defaultHeight]);

  const persist = useCallback(
    (w: number, h: number) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ w, h }));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      drag.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: live.current.w,
        startH: live.current.h,
      };

      const onMove = (ev: MouseEvent) => {
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => {
          const dw = ev.clientX - drag.current.startX;
          const dh = ev.clientY - drag.current.startY;
          const nw = Math.max(minWidth, Math.min(drag.current.startW + dw, window.innerWidth - 24));
          const nh = Math.max(minHeight, Math.min(drag.current.startH + dh, window.innerHeight - 24));
          live.current = { w: nw, h: nh };
          setSize({ w: nw, h: nh });
        });
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (raf.current) cancelAnimationFrame(raf.current);
        persist(live.current.w, live.current.h);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [enabled, minHeight, minWidth, persist]
  );

  return {
    size,
    resizeHandleProps: {
      onMouseDown,
      role: "button" as const,
      tabIndex: -1 as const,
    },
  };
}
