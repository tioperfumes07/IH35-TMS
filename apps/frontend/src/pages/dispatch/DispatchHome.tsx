import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  getDispatchDashboard,
  getDispatchDriverStatus,
  getDispatchLoadDetail,
  getDispatchPreferences,
  listDispatchLoads,
  listUnitsWithoutLoad,
  type DispatchLoad,
  type DispatchStatus,
  updateDispatchPreferences,
  type DispatchV2View,
} from "../../api/dispatch";
import { LoadDetailDrawer } from "../../components/dispatch/LoadDetailDrawer";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BookLoadModal } from "./components/BookLoadModal";
import { LoadTable } from "./components/LoadTable";
import { UnitsWithoutLoadTable } from "./components/UnitsWithoutLoadTable";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function parseStatuses(params: URLSearchParams): DispatchStatus[] {
  return params.getAll("status") as DispatchStatus[];
}

export function DispatchHomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { companies, selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();

  const companyId = selectedCompanyId || companies[0]?.id || "";
  const urlView = searchParams.get("view") as DispatchV2View | null;
  const [bookOpen, setBookOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<string | null>(searchParams.get("load_id"));
  const [driverStatusLoad, setDriverStatusLoad] = useState<DispatchLoad | null>(null);

  const prefQuery = useQuery({
    queryKey: ["dispatch", "prefs"],
    queryFn: getDispatchPreferences,
  });

  const resolvedView: DispatchV2View = urlView || prefQuery.data?.dispatch_default_view || "home";
  const statuses = parseStatuses(searchParams);

  useEffect(() => {
    if (urlView) return;
    if (!prefQuery.data?.dispatch_default_view) return;
    const next = new URLSearchParams(searchParams);
    next.set("view", prefQuery.data.dispatch_default_view);
    setSearchParams(next, { replace: true });
  }, [prefQuery.data?.dispatch_default_view, searchParams, setSearchParams, urlView]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (searchParams.get("company") === selectedCompanyId) return;
    const next = new URLSearchParams(searchParams);
    next.set("company", selectedCompanyId);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedCompanyId, setSearchParams]);

  const loadsQuery = useQuery({
    queryKey: ["dispatch", "v2", "loads", companyId, resolvedView, searchParams.toString()],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: companyId,
        view: resolvedView,
        limit: Number(searchParams.get("limit") ?? "50"),
        offset: Number(searchParams.get("offset") ?? "0"),
        status: statuses,
        customer: searchParams.get("customer"),
        driver: searchParams.get("driver"),
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      }),
    enabled: Boolean(companyId),
  });

  const kpiQuery = useQuery({
    queryKey: ["dispatch", "v2", "kpis", companyId],
    queryFn: () => getDispatchDashboard(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const unitsQuery = useQuery({
    queryKey: ["dispatch", "v2", "units-without-load", companyId],
    queryFn: () => listUnitsWithoutLoad(companyId),
    enabled: Boolean(companyId),
  });

  const driverStatusQuery = useQuery({
    queryKey: ["dispatch", "v2", "driver-status", companyId, driverStatusLoad?.id ?? "none"],
    queryFn: () => getDispatchDriverStatus(driverStatusLoad!.id, companyId),
    enabled: Boolean(driverStatusLoad?.id && companyId),
  });

  const detailPrefetch = async (id: string) => {
    await queryClient.prefetchQuery({
      queryKey: ["dispatch", "v2", "detail", companyId, id],
      queryFn: () => getDispatchLoadDetail(id, companyId),
    });
  };

  const setView = async (nextView: DispatchV2View) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", nextView);
    setSearchParams(next);
    try {
      await updateDispatchPreferences(nextView);
    } catch {
      pushToast("Could not persist dispatch default view", "error");
    }
  };

  const kpiCards = useMemo(
    () => [
      { label: "Dispatched", value: kpiQuery.data?.dispatched ?? 0 },
      { label: "Need Load", value: kpiQuery.data?.need_load ?? 0, className: "text-amber-700" },
      { label: "Delivered", value: kpiQuery.data?.delivered ?? 0 },
      { label: "In Transit", value: kpiQuery.data?.in_transit ?? 0 },
      { label: "Proj Inv Wk", value: money(kpiQuery.data?.proj_inv_wk_cents ?? 0) },
      { label: "Deadhead", value: `${kpiQuery.data?.deadhead_pct ?? 0}%` },
      { label: "MPG", value: String(kpiQuery.data?.mpg ?? 0) },
    ],
    [kpiQuery.data]
  );

  const loads = loadsQuery.data?.loads ?? [];
  const unitsWithoutLoad = unitsQuery.data?.units ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Dispatch Home"
        subtitle="Approved May 2 list-table layout"
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant={resolvedView === "home" ? "primary" : "secondary"} size="sm" onClick={() => void setView("home")}>
              Dispatch Home
            </Button>
            <Button type="button" variant={resolvedView === "loads" ? "primary" : "secondary"} size="sm" onClick={() => void setView("loads")}>
              Loads (Full List)
            </Button>
            <Button type="button" onClick={() => setBookOpen(true)}>+ Book Load</Button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {["Dispatch", "Loads ▾", "Northbound / Southbound", "By trailer type", "Cash advances", "Pre-settlements", "Company settlements", "Geofence map", "Incidents", "Factoring packets"].map(
            (item) => (
              <span key={item} className={item.startsWith("Dispatch") ? "border-b border-white pb-0.5 font-semibold" : ""}>{item}</span>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {kpiCards.map((card) => (
          <div key={card.label} className={`rounded border border-gray-200 bg-white px-2 py-1 text-[11px] ${card.className ?? ""}`}>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{card.label}</div>
            <div className="font-semibold">{card.value}</div>
          </div>
        ))}
      </div>

      {resolvedView === "home" ? (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Units With A Load</h2>
            <LoadTable
              rows={loads}
              selectedLoadId={selectedLoad}
              onRowClick={(row) => {
                setSelectedLoad(row.id);
                void detailPrefetch(row.id);
                const next = new URLSearchParams(searchParams);
                next.set("load_id", row.id);
                setSearchParams(next);
              }}
              onDriverStatusClick={(row) => setDriverStatusLoad(row)}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Units Without A Load</h2>
            <UnitsWithoutLoadTable rows={unitsWithoutLoad} onRowClick={() => pushToast("Unit detail integration is pending follow-up task", "info")} />
          </section>
        </>
      ) : (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Loads (Full List)</h2>
          <LoadTable
            rows={loads}
            selectedLoadId={selectedLoad}
            onRowClick={(row) => {
              setSelectedLoad(row.id);
              const next = new URLSearchParams(searchParams);
              next.set("load_id", row.id);
              setSearchParams(next);
            }}
            onDriverStatusClick={(row) => setDriverStatusLoad(row)}
          />
        </section>
      )}

      <LoadDetailDrawer
        loadId={selectedLoad}
        isOpen={Boolean(selectedLoad)}
        canEdit
        onClose={() => {
          setSelectedLoad(null);
          const next = new URLSearchParams(searchParams);
          next.delete("load_id");
          setSearchParams(next);
        }}
      />

      <BookLoadModal
        open={bookOpen}
        operatingCompanyId={companyId}
        onClose={() => setBookOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["dispatch", "v2"] });
        }}
      />

      <Modal open={Boolean(driverStatusLoad)} onClose={() => setDriverStatusLoad(null)} title="Driver Status Timeline">
        <div className="space-y-2 text-sm">
          <div className="text-xs text-gray-600">Load: {driverStatusLoad?.load_number}</div>
          <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs">
            {JSON.stringify(driverStatusQuery.data ?? { timeline: [] }, null, 2)}
          </pre>
        </div>
      </Modal>
    </div>
  );
}
