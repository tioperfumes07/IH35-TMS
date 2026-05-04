import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deactivateDriver, getDriver, updateDriver } from "../api/mdata";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export function DriverDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const driverQuery = useQuery({
    queryKey: ["driver", id],
    queryFn: () => getDriver(id),
    enabled: Boolean(id),
  });

  const driver = driverQuery.data;

  const [form, setForm] = useState<Record<string, string>>({});

  const hydratedForm = useMemo(() => {
    if (!driver) return form;
    if (Object.keys(form).length > 0) return form;
    return {
      first_name: driver.first_name ?? "",
      last_name: driver.last_name ?? "",
      phone: driver.phone ?? "",
      email: driver.email ?? "",
      cdl_number: driver.cdl_number ?? "",
      cdl_state: driver.cdl_state ?? "",
      cdl_class: driver.cdl_class ?? "A",
      cdl_expires_at: formatDate(driver.cdl_expires_at),
      hire_date: formatDate(driver.hire_date),
      dot_medical_expires_at: formatDate(driver.dot_medical_expires_at),
      hazmat_endorsement_expires_at: formatDate(driver.hazmat_endorsement_expires_at),
      status: driver.status,
      notes: driver.notes ?? "",
    };
  }, [driver, form]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateDriver(id, {
        ...hydratedForm,
        email: hydratedForm.email || null,
        cdl_number: hydratedForm.cdl_number || null,
        cdl_state: hydratedForm.cdl_state || null,
        notes: hydratedForm.notes || null,
        cdl_expires_at: hydratedForm.cdl_expires_at || null,
        hire_date: hydratedForm.hire_date || null,
        dot_medical_expires_at: hydratedForm.dot_medical_expires_at || null,
        hazmat_endorsement_expires_at: hydratedForm.hazmat_endorsement_expires_at || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["driver", id], updated);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setEditMode(false);
      pushToast("Driver updated", "success");
    },
    onError: () => pushToast("Failed to update driver", "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      pushToast("Driver deactivated", "info");
    },
    onError: () => pushToast("Failed to deactivate driver", "error"),
  });

  if (driverQuery.isLoading) {
    return <div className="text-sm text-gray-500">Loading driver...</div>;
  }

  if (!driver) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-crit">Driver not found.</div>
        <Button variant="secondary" onClick={() => navigate("/drivers")}>
          Back to Drivers
        </Button>
      </div>
    );
  }

  const fields: Array<[string, string, string]> = [
    ["first_name", "First Name", "text"],
    ["last_name", "Last Name", "text"],
    ["phone", "Phone", "text"],
    ["email", "Email", "email"],
    ["cdl_number", "CDL #", "text"],
    ["cdl_state", "CDL State", "text"],
    ["cdl_expires_at", "CDL Expires", "date"],
    ["hire_date", "Hire Date", "date"],
    ["dot_medical_expires_at", "DOT Medical Expires", "date"],
    ["hazmat_endorsement_expires_at", "Hazmat Endorsement Expires", "date"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {driver.first_name} {driver.last_name}
          </h1>
          <div className="mt-1">
            <StatusBadge status={driver.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode ? (
            <Button onClick={() => setEditMode(true)}>Edit</Button>
          ) : (
            <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
              Save
            </Button>
          )}
          {driver.status !== "Terminated" ? (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = window.confirm("Deactivate this driver?");
                if (!ok) return;
                await deactivateMutation.mutateAsync();
              }}
              loading={deactivateMutation.isPending}
            >
              Deactivate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">{label}</label>
            <input
              type={type}
              value={hydratedForm[key] ?? ""}
              disabled={!editMode}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">CDL Class</label>
          <select
            disabled={!editMode}
            value={hydratedForm.cdl_class ?? "A"}
            onChange={(event) => setForm((current) => ({ ...current, cdl_class: event.target.value }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Status</label>
          <select
            disabled={!editMode}
            value={hydratedForm.status ?? "Probation"}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="Probation">Probation</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Terminated">Terminated</option>
            <option value="OnLeave">OnLeave</option>
          </select>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
        Last updated by {driver.updated_by_user_id} on {new Date(driver.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
