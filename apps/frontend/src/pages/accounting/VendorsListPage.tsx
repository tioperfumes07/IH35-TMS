import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { listAccountingVendors, type AccountingVendorListRow } from "../../api/accounting-qbo-entities";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents, formatDate } from "../../lib/format";

const createVendorSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(300),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().max(80).optional(),
  billing_address: z.string().max(2000).optional(),
  shipping_address: z.string().max(2000).optional(),
  category: z.string().max(120).optional(),
  eligible_1099: z.boolean().optional(),
});

type CreateForm = z.infer<typeof createVendorSchema>;

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
      aria-pressed={active}
      aria-label={`Filter category ${label}`}
    >
      {label}
    </button>
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).slice(0, 2);
  return p.map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";
}

async function postAccountingVendor(
  operatingCompanyId: string,
  body: {
    display_name: string;
    email?: string;
    phone?: string;
    billing_address?: string;
    shipping_address?: string;
    category?: string;
    eligible_1099?: boolean;
  }
) {
  const { apiRequest } = await import("../../api/client");
  return apiRequest<{ id: string }>("/api/v1/accounting/vendors", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, ...body },
  });
}

export function VendorsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const [only1099, setOnly1099] = useState(false);

  const categories = useMemo(() => ["All", "Fuel", "Repair", "Other"], []);

  const listQ = useQuery({
    queryKey: ["accounting", "vendors", companyId, search, category, cursor, only1099],
    queryFn: async () => {
      try {
        return await listAccountingVendors(companyId, {
          search: search.trim() || undefined,
          category: category && category !== "All" ? category : undefined,
          cursor: cursor ?? undefined,
          limit: 50,
          eligible_1099: only1099 ? true : undefined,
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return { items: [] as AccountingVendorListRow[], next_cursor: null as string | null, wave404: true as const };
        }
        throw e;
      }
    },
    enabled: Boolean(companyId),
  });

  const rows = listQ.data?.items ?? [];
  const wave404 = listQ.data && "wave404" in listQ.data && listQ.data.wave404;

  const form = useForm<CreateForm>({
    defaultValues: {
      display_name: "",
      email: "",
      phone: "",
      billing_address: "",
      shipping_address: "",
      category: "",
      eligible_1099: false,
    },
  });

  const createMut = useMutation({
    mutationFn: (body: CreateForm) =>
      postAccountingVendor(companyId, {
        display_name: body.display_name,
        email: body.email?.trim() || undefined,
        phone: body.phone?.trim() || undefined,
        billing_address: body.billing_address?.trim() || undefined,
        shipping_address: body.shipping_address?.trim() || undefined,
        category: body.category?.trim() || undefined,
        eligible_1099: body.eligible_1099,
      }),
    onSuccess: (res) => {
      pushToast("Vendor created", "success");
      setCreateOpen(false);
      form.reset();
      void qc.invalidateQueries({ queryKey: ["accounting", "vendors"] });
      if (res.id) navigate(`/vendors/`);
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Create failed"), "error"),
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleRow = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const toggleAll = (ids: string[]) => {
    const allOn = ids.every((id) => selected[id]);
    const next: Record<string, boolean> = {};
    for (const id of ids) next[id] = !allOn;
    setSelected((s) => ({ ...s, ...next }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 bg-gray-50 p-4">
      {wave404 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Backend Wave 2 not yet deployed. Refresh in a minute.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-gray-900">
          <Link to="/accounting" className="text-sm text-gray-500 hover:text-gray-800" aria-label="Back to accounting dashboard">
            ← Dashboard
          </Link>
          <span className="text-gray-400" aria-hidden>
            ›
          </span>
          <h1 className="text-xl font-semibold">Vendors</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/help" className="text-sm text-blue-600 hover:underline">
            Give feedback
          </a>
          <Button variant="secondary" className="inline-flex items-center gap-1 border border-gray-300 bg-white text-gray-800" aria-label="Edit menu">
            Edit
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            className="inline-flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setCreateOpen(true)}
            aria-label="Create vendor"
          >
            + Vendor
            <ChevronDown className="h-4 w-4 text-white/90" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            className="w-full rounded border border-gray-300 py-2 pl-8 pr-2 text-sm"
            placeholder="Search by name or details"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
            aria-label="Search vendors"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={category === c || (c === "All" && !category)}
              onClick={() => {
                setCategory(c === "All" ? "" : c);
                setCursor(null);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className={`rounded border px-3 py-2 text-xs font-semibold ${only1099 ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white text-gray-700"}`}
          aria-pressed={only1099}
          onClick={() => {
            setOnly1099((v) => !v);
            setCursor(null);
          }}
          aria-label="Toggle 1099 eligible filter"
        >
          1099-eligible
        </button>
        <button
          type="button"
          className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
            editCategories ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white text-gray-700"
          }`}
          onClick={() => setEditCategories((v) => !v)}
          aria-pressed={editCategories}
          aria-label="Toggle edit categories mode"
        >
          Edit categories
        </button>
      </div>

      {editCategories && selectedCount > 0 ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-t-lg border border-gray-200 bg-white p-3 shadow-lg">
          <span className="text-sm font-medium text-gray-800">{selectedCount} selected</span>
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" aria-label="Bulk category">
            <option>Category…</option>
            <option>Broker</option>
            <option>Direct</option>
          </select>
          <Button className="bg-emerald-600 text-white" aria-label={`Apply category to ${selectedCount} vendors`}>
            Apply to {selectedCount}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {!companyId ? (
          <p className="p-6 text-sm text-amber-800">Select an operating company.</p>
        ) : listQ.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load vendors.</p>
        ) : rows.length === 0 && !listQ.isLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 text-4xl text-gray-400" aria-hidden>
              {initials("Vendor")}
            </div>
            <p className="text-base font-medium text-gray-800">No vendors yet</p>
            <Button className="bg-emerald-600 text-white" onClick={() => setCreateOpen(true)} aria-label="Create first vendor">
              + Vendor
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all vendors"
                      checked={rows.length > 0 && rows.every((r) => selected[r.id])}
                      onChange={() => toggleAll(rows.map((r) => r.id))}
                    />
                  </th>
                  <th className="px-3 py-2">
                    <button type="button" className="flex items-center gap-1 font-semibold" aria-label="Sort by vendor name">
                      Name
                      <span className="text-gray-400">▼</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2 text-right">Open bills</th>
                  <th className="px-3 py-2 text-right">Open balance</th>
                  <th className="px-3 py-2 text-right">Total spent YTD</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">1099</th>
                  <th className="px-3 py-2">Last bill date</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 align-middle">
                      <input type="checkbox" checked={Boolean(selected[r.id])} onChange={() => toggleRow(r.id)} aria-label={`Select ${r.display_name}`} />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <Link to={`/vendors/${r.id}`} className="text-blue-700 hover:underline">
                        {r.display_name || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.email ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-700">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.open_bill_count ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCents(r.open_balance_cents ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyCents(r.total_spent_ytd_cents ?? 0)}</td>
                    <td className="px-3 py-2">
                      {r.category ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{r.category}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.eligible_1099 ? (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">1099</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.last_bill_date ? formatDate(r.last_bill_date) : "—"}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="inline-flex items-center gap-1 text-blue-600 hover:underline" aria-label={`View ${r.display_name}`}>
                        View
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {listQ.data?.next_cursor ? (
          <div className="flex justify-end border-t border-gray-100 p-2">
            <Button variant="secondary" onClick={() => setCursor(listQ.data.next_cursor ?? null)} aria-label="Load more vendors">
              Next page
            </Button>
          </div>
        ) : null}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create vendor">
        <form
          className="space-y-3 p-4"
          onSubmit={form.handleSubmit((raw) => {
            const parsed = createVendorSchema.safeParse(raw);
            if (!parsed.success) {
              const first = parsed.error.flatten().fieldErrors;
              const msg = first.display_name?.[0] ?? first.email?.[0] ?? "Check form";
              pushToast(msg, "error");
              return;
            }
            createMut.mutate(parsed.data);
          })}
        >
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Display name</label>
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" {...form.register("display_name")} aria-label="Display name" />
            {form.formState.errors.display_name ? <p className="text-xs text-red-600">{form.formState.errors.display_name.message}</p> : null}
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Email</label>
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" {...form.register("email")} aria-label="Email" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Phone</label>
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" {...form.register("phone")} aria-label="Phone" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Billing address</label>
            <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={2} {...form.register("billing_address")} aria-label="Billing address" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Shipping address</label>
            <textarea className="mt-1 w-full rounded border px-2 py-1 text-sm" rows={2} {...form.register("shipping_address")} aria-label="Shipping address" />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" {...form.register("eligible_1099")} aria-label="Eligible for 1099" />
              1099-eligible
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Category</label>
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" {...form.register("category")} aria-label="Category" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)} aria-label="Cancel create vendor">
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 text-white" disabled={createMut.isPending} aria-label="Submit create vendor">
              + Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
