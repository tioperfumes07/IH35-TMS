import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  "data-subtab-row"?: string;
};

export function SubTabRow({ children, className = "", ...rest }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const refreshScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    refreshScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", refreshScrollState, { passive: true });
    const observer = new ResizeObserver(refreshScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", refreshScrollState);
      observer.disconnect();
    };
  }, [refreshScrollState, children]);

  const scrollByFraction = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.3, 120), behavior: "smooth" });
  };

  return (
    <div className={`relative flex items-center gap-1 ${className}`.trim()} data-subtab-row={rest["data-subtab-row"] ?? "true"}>
      <ScrollChevron
        direction="left"
        visible={canScrollLeft}
        onClick={() => scrollByFraction(-1)}
      />
      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-x-auto border-b border-gray-200 bg-white px-1 py-1 [-webkit-overflow-scrolling:touch]"
      >
        <div className="flex min-w-max gap-4">{children}</div>
      </div>
      <ScrollChevron
        direction="right"
        visible={canScrollRight}
        onClick={() => scrollByFraction(1)}
      />
    </div>
  );
}

function ScrollChevron({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      className="hidden shrink-0 rounded border border-gray-200 bg-white p-1 text-slate-600 shadow-sm hover:bg-gray-50 lg:inline-flex"
      aria-label={direction === "left" ? "Scroll sub-tabs left" : "Scroll sub-tabs right"}
      data-subtab-scroll-chevron={direction}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
