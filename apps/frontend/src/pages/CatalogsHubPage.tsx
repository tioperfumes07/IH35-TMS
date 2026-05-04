import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCatalogRegistry, previewCatalog, type CatalogPreviewResponse } from "../api/catalogs";

const DEPARTMENT_STYLES: Record<string, { dot: string; border: string; tint: string }> = {
  dispatch: { dot: "bg-blue-500", border: "hover:border-blue-300", tint: "hover:bg-blue-50" },
  safety: { dot: "bg-red-500", border: "hover:border-red-300", tint: "hover:bg-red-50" },
  accounting: { dot: "bg-green-500", border: "hover:border-green-300", tint: "hover:bg-green-50" },
  identity: { dot: "bg-purple-500", border: "hover:border-purple-300", tint: "hover:bg-purple-50" },
  operations: { dot: "bg-amber-500", border: "hover:border-amber-300", tint: "hover:bg-amber-50" },
};

export function CatalogsHubPage() {
  const navigate = useNavigate();
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, CatalogPreviewResponse>>({});
  const hoverTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const registryQuery = useQuery({
    queryKey: ["catalog-registry"],
    queryFn: () => listCatalogRegistry().then((result) => result.departments),
  });

  const activeCode = hoveredCode;
  const activePreview = activeCode ? previewCache[activeCode] : undefined;

  useEffect(() => {
    if (!activeCode || previewCache[activeCode]) return;
    void previewCatalog(activeCode).then((preview) => {
      setPreviewCache((current) => ({ ...current, [activeCode]: preview }));
    });
  }, [activeCode, previewCache]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setHoveredCode(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  function queueHover(code: string) {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHoveredCode(code), 250);
  }

  function clearHover() {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredCode(null);
  }

  return (
    <div ref={rootRef} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Lists & Catalogs</h1>
        <p className="mt-1 text-sm text-gray-600">Reference data and configuration catalogs, organized by department</p>
      </div>

      {registryQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading catalog registry...</div>
      ) : (
        <div className="space-y-5">
          {(registryQuery.data ?? []).map((department) => (
            <section key={department.code} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">{department.name}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                {department.catalogs.map((catalog) => {
                  const style = DEPARTMENT_STYLES[department.code] ?? DEPARTMENT_STYLES.operations;
                  const isOpen = activeCode === catalog.code;
                  const preview = previewCache[catalog.code];
                  const hiddenCount = Math.max(0, catalog.item_count - (preview?.items.length ?? 0));
                  return (
                    <div
                      key={catalog.code}
                      className="relative"
                      onMouseEnter={() => queueHover(catalog.code)}
                      onMouseLeave={() => clearHover()}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(catalog.route_path)}
                        className={`flex h-9 w-full items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 text-left transition ${style.border} ${style.tint}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800">{catalog.name}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{catalog.item_count}</span>
                      </button>

                      {isOpen ? (
                        <div className="absolute left-0 top-full z-30 mt-1 w-max min-w-full max-w-[560px] rounded border border-gray-200 bg-white p-1 shadow-lg">
                          <div className="max-h-80 overflow-auto">
                            {(activePreview?.items ?? []).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-4 rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(item.route_path);
                                  setHoveredCode(null);
                                }}
                              >
                                <span className="truncate text-gray-800">{item.label}</span>
                                {item.sub_label ? <span className="shrink-0 text-[10px] text-gray-500">{item.sub_label}</span> : null}
                              </button>
                            ))}
                          </div>
                          {activePreview?.truncated && hiddenCount > 0 ? (
                            <button
                              type="button"
                              className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left text-[11px] text-gray-600 hover:bg-gray-100"
                              onClick={() => {
                                navigate(catalog.route_path);
                                setHoveredCode(null);
                              }}
                            >
                              + {hiddenCount} more
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
