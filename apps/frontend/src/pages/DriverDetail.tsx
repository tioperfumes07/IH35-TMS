import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { listEquipmentTypes } from "../api/catalogs";
import { listMyCompanies } from "../api/org";
import {
  changeDriverQualificationRate,
  createDriverQualification,
  deactivateDriver,
  deactivateDriverQualification,
  disableDriverPhoneLogin,
  enableDriverPhoneLogin,
  getDriver,
  getDriverQualificationRateHistory,
  listDriverCompanyAuthorizations,
  listDriverQualifications,
  upsertDriverCompanyAuthorization,
  updateDriver,
} from "../api/mdata";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

const tabs = ["Identity", "Mexican Identity", "Equipment & Pay", "Insurance Authorizations"] as const;
type DriverTab = (typeof tabs)[number];

const reasonOptions = [
  { value: "raise", label: "Raise" },
  { value: "demotion", label: "Demotion" },
  { value: "contract_renegotiation", label: "Contract renegotiation" },
  { value: "annual_adjustment", label: "Annual adjustment" },
  { value: "promotion", label: "Promotion" },
  { value: "correction", label: "Correction" },
  { value: "other", label: "Other" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function formatDateRange(from: string, to: string | null) {
  return `${formatDate(from)} - ${to ? formatDate(to) : "current"}`;
}

export function DriverDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<DriverTab>("Identity");
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  const [addQualificationOpen, setAddQualificationOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedQualificationId, setSelectedQualificationId] = useState("");
  const [selectedLineItemId, setSelectedLineItemId] = useState("");
  const [selectedEquipmentName, setSelectedEquipmentName] = useState("");
  const [selectedLineItemName, setSelectedLineItemName] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [newQualificationForm, setNewQualificationForm] = useState<Record<string, string>>({
    equipment_type_id: "",
    qualified_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [rateChangeForm, setRateChangeForm] = useState<Record<string, string>>({
    amount: "",
    effective_from: new Date().toISOString().slice(0, 10),
    change_reason: "raise",
    change_notes: "",
  });
  const [authorizationNotesByCompany, setAuthorizationNotesByCompany] = useState<Record<string, string>>({});

  const driverQuery = useQuery({
    queryKey: ["driver", id],
    queryFn: () => getDriver(id),
    enabled: Boolean(id),
  });

  const qualificationsQuery = useQuery({
    queryKey: ["driver-qualifications", id],
    queryFn: () => listDriverQualifications(id).then((result) => result.qualifications),
    enabled: Boolean(id),
  });

  const companiesQuery = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => listMyCompanies().then((result) => result.companies),
  });

  const companyAuthQuery = useQuery({
    queryKey: ["driver-company-authorizations", id],
    queryFn: () => listDriverCompanyAuthorizations(id).then((result) => result.authorizations),
    enabled: Boolean(id),
  });

  const equipmentTypesQuery = useQuery({
    queryKey: ["equipment-types-for-driver-detail"],
    queryFn: () => listEquipmentTypes(false).then((result) => result.equipment_types),
  });

  const historyQuery = useQuery({
    queryKey: ["driver-rate-history", id, selectedQualificationId, selectedLineItemId],
    queryFn: () => getDriverQualificationRateHistory(id, selectedQualificationId),
    enabled: historyModalOpen && Boolean(id) && Boolean(selectedQualificationId),
  });

  const driver = driverQuery.data;
  const canManageRates = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager";
  const canManageCompanyAuth =
    user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager" || user?.role === "Safety";

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
      visa_type: driver.visa_type ?? "",
      visa_number: driver.visa_number ?? "",
      visa_expires_at: formatDate(driver.visa_expires_at),
      passport_number: driver.passport_number ?? "",
      passport_expires_at: formatDate(driver.passport_expires_at),
      ine_number: driver.ine_number ?? "",
      curp: driver.curp ?? "",
      mx_address_line1: driver.mx_address_line1 ?? "",
      mx_address_line2: driver.mx_address_line2 ?? "",
      mx_city: driver.mx_city ?? "",
      mx_state: driver.mx_state ?? "",
      mx_postal_code: driver.mx_postal_code ?? "",
      emergency_contact_name: driver.emergency_contact_name ?? "",
      emergency_contact_relationship: driver.emergency_contact_relationship ?? "",
      emergency_contact_phone_primary: driver.emergency_contact_phone_primary ?? "",
      emergency_contact_phone_alternate: driver.emergency_contact_phone_alternate ?? "",
      emergency_contact_address: driver.emergency_contact_address ?? "",
      emergency_contact_notes: driver.emergency_contact_notes ?? "",
      status: driver.status,
      notes: driver.notes ?? "",
    };
  }, [driver, form]);

  const selectedLineHistory = useMemo(() => {
    const rows = historyQuery.data?.line_items ?? [];
    return rows.find((line) => line.line_item_template_id === selectedLineItemId)?.history ?? [];
  }, [historyQuery.data, selectedLineItemId]);

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
        visa_type: hydratedForm.visa_type || null,
        visa_number: hydratedForm.visa_number || null,
        visa_expires_at: hydratedForm.visa_expires_at || null,
        passport_number: hydratedForm.passport_number || null,
        passport_expires_at: hydratedForm.passport_expires_at || null,
        ine_number: hydratedForm.ine_number || null,
        curp: hydratedForm.curp || null,
        mx_address_line1: hydratedForm.mx_address_line1 || null,
        mx_address_line2: hydratedForm.mx_address_line2 || null,
        mx_city: hydratedForm.mx_city || null,
        mx_state: hydratedForm.mx_state || null,
        mx_postal_code: hydratedForm.mx_postal_code || null,
        emergency_contact_name: hydratedForm.emergency_contact_name || null,
        emergency_contact_relationship: hydratedForm.emergency_contact_relationship || null,
        emergency_contact_phone_primary: hydratedForm.emergency_contact_phone_primary || null,
        emergency_contact_phone_alternate: hydratedForm.emergency_contact_phone_alternate || null,
        emergency_contact_address: hydratedForm.emergency_contact_address || null,
        emergency_contact_notes: hydratedForm.emergency_contact_notes || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["driver", id], updated);
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setEditMode(false);
      pushToast("Driver updated", "success");
    },
    onError: () => pushToast("Failed to update driver", "error"),
  });

  const addQualificationMutation = useMutation({
    mutationFn: ({ driverId, body }: { driverId: string; body: Parameters<typeof createDriverQualification>[1] }) =>
      createDriverQualification(driverId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      setAddQualificationOpen(false);
      setNewQualificationForm({
        equipment_type_id: "",
        qualified_at: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      pushToast("Qualification added", "success");
    },
    onError: () => pushToast("Failed to add qualification", "error"),
  });

  const deactivateQualificationMutation = useMutation({
    mutationFn: ({ driverId, qualificationId }: { driverId: string; qualificationId: string }) =>
      deactivateDriverQualification(driverId, qualificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      pushToast("Qualification deactivated", "info");
    },
    onError: () => pushToast("Failed to deactivate qualification", "error"),
  });

  const changeRateMutation = useMutation({
    mutationFn: ({
      driverId,
      qualificationId,
      body,
    }: {
      driverId: string;
      qualificationId: string;
      body: Parameters<typeof changeDriverQualificationRate>[2];
    }) => changeDriverQualificationRate(driverId, qualificationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-qualifications", id] });
      queryClient.invalidateQueries({ queryKey: ["driver-rate-history", id, selectedQualificationId, selectedLineItemId] });
      setRateModalOpen(false);
      pushToast("Rate changed", "success");
    },
    onError: () => pushToast("Failed to change rate", "error"),
  });

  const upsertCompanyAuthMutation = useMutation({
    mutationFn: ({ driverId, body }: { driverId: string; body: Parameters<typeof upsertDriverCompanyAuthorization>[1] }) =>
      upsertDriverCompanyAuthorization(driverId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-company-authorizations", id] });
      pushToast("Authorization updated", "success");
    },
    onError: () => pushToast("Failed to update authorization", "error"),
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

  const enablePhoneLoginMutation = useMutation({
    mutationFn: () => enableDriverPhoneLogin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setEnableModalOpen(false);
      pushToast("Phone login enabled", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Phone login is already enabled", "info");
        return;
      }
      pushToast("Failed to enable phone login", "error");
    },
  });

  const disablePhoneLoginMutation = useMutation({
    mutationFn: () => disableDriverPhoneLogin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver", id] });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      pushToast("Phone login disabled", "info");
    },
    onError: () => pushToast("Failed to disable phone login", "error"),
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

  const hasPhoneLogin = Boolean(driver.identity_user_id);
  const maskedPhone = driver.phone.replace(/^(\+?\d{0,2})?(\d{3})(\d{3})(\d{4})$/, "$2-$3-$4");
  const qualifications = qualificationsQuery.data ?? [];
  const companies = companiesQuery.data ?? [];
  const authorizations = companyAuthQuery.data ?? [];
  const equipmentTypeOptions =
    equipmentTypesQuery.data?.filter((type) => !qualifications.some((qualification) => qualification.equipment_type_id === type.id)) ?? [];

  const selectedRateFromCard = qualifications
    .find((qualification) => qualification.id === selectedQualificationId)
    ?.current_rates.find((line) => line.line_item_template_id === selectedLineItemId);

  const saveDriver = async () => {
    const errors: Record<string, string> = {};
    if (hydratedForm.visa_type === "B1") {
      if (!hydratedForm.ine_number.trim()) errors.ine_number = "INE number is required when visa type is B1";
      if (!hydratedForm.curp.trim()) errors.curp = "CURP is required when visa type is B1";
    }
    if (hydratedForm.curp && !/^[A-Z0-9]{18}$/i.test(hydratedForm.curp)) {
      errors.curp = "CURP must be 18 alphanumeric characters";
    }
    if (hydratedForm.ine_number && (hydratedForm.ine_number.length < 8 || hydratedForm.ine_number.length > 20)) {
      errors.ine_number = "INE must be between 8 and 20 characters";
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;
    await updateMutation.mutateAsync();
  };

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-gray-500">
        <button type="button" className="text-sky-700 hover:underline" onClick={() => navigate("/drivers")}>
          Drivers
        </button>
        <span className="mx-1">/</span>
        <span>
          {driver.first_name} {driver.last_name}
        </span>
      </div>

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
            <Button onClick={() => void saveDriver()} loading={updateMutation.isPending}>
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

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-1">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-2 text-sm font-medium ${
                activeTab === tab ? "bg-sky-100 text-sky-800" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Identity" ? (
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Has phone login</label>
            <div className="rounded border border-gray-300 px-2 py-2 text-sm">{hasPhoneLogin ? "Yes" : "No"}</div>
          </div>
          <div className="flex items-end">
            {!hasPhoneLogin ? (
              <Button onClick={() => setEnableModalOpen(true)} loading={enablePhoneLoginMutation.isPending}>
                Enable phone login
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Phone login enabled</span>
                <Button
                  variant="danger"
                  onClick={() => disablePhoneLoginMutation.mutate()}
                  loading={disablePhoneLoginMutation.isPending}
                >
                  Disable login
                </Button>
              </div>
            )}
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-600">Visa & Passport</div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["visa_number", "Visa Number", "text"],
                ["visa_expires_at", "Visa Expires", "date"],
                ["passport_number", "Passport Number", "text"],
                ["passport_expires_at", "Passport Expires", "date"],
              ].map(([key, label, type]) => (
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
                <label className="text-xs font-semibold text-gray-600">Visa Type</label>
                <select
                  value={hydratedForm.visa_type ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, visa_type: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">None</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-600">Emergency Contact</div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["emergency_contact_name", "Name"],
                ["emergency_contact_relationship", "Relationship"],
                ["emergency_contact_phone_primary", "Phone Primary"],
                ["emergency_contact_phone_alternate", "Phone Alternate"],
              ].map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">{label}</label>
                  <input
                    value={hydratedForm[key] ?? ""}
                    disabled={!editMode}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>
              ))}
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Address</label>
                <textarea
                  value={hydratedForm.emergency_contact_address ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, emergency_contact_address: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                  rows={2}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Notes</label>
                <textarea
                  value={hydratedForm.emergency_contact_notes ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, emergency_contact_notes: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                  rows={2}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "Mexican Identity" ? (
        <div className="space-y-3 rounded-md border border-gray-200 p-3">
          <p className="text-sm text-gray-700">Required for B1/Mexican drivers. Leave blank for non-Mexican drivers.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">INE Number</label>
              <input
                value={hydratedForm.ine_number ?? ""}
                disabled={!editMode}
                onChange={(event) => setForm((current) => ({ ...current, ine_number: event.target.value }))}
                className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                placeholder="13 digits typical"
              />
              {validationErrors.ine_number ? <span className="text-xs text-crit">{validationErrors.ine_number}</span> : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">CURP</label>
              <input
                value={hydratedForm.curp ?? ""}
                disabled={!editMode}
                onChange={(event) => setForm((current) => ({ ...current, curp: event.target.value.toUpperCase() }))}
                className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                placeholder="AAAA######HXXAAA##"
              />
              {validationErrors.curp ? <span className="text-xs text-crit">{validationErrors.curp}</span> : null}
            </div>
            {[
              ["mx_address_line1", "Street line 1"],
              ["mx_address_line2", "Street line 2"],
              ["mx_city", "City"],
              ["mx_state", "State"],
              ["mx_postal_code", "Postal code"],
            ].map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">{label}</label>
                <input
                  value={hydratedForm[key] ?? ""}
                  disabled={!editMode}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "Equipment & Pay" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Qualifications</h2>
            {canManageRates ? (
              <Button onClick={() => setAddQualificationOpen(true)} disabled={equipmentTypeOptions.length === 0}>
                + Add Equipment Qualification
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {qualifications.map((qualification) => (
              <div key={qualification.id} className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">{qualification.equipment_type.name}</span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        qualification.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {qualification.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">Qualified: {formatDate(qualification.qualified_at)}</div>
                </div>
                <div className="mt-2 space-y-2">
                  {qualification.current_rates.map((line) => (
                    <div key={line.line_item_template_id} className="rounded border border-gray-100 bg-gray-50 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-800">
                          {line.line_item_name} ({line.line_item_code})
                        </div>
                        <div className="text-sm text-gray-700">{line.amount ? `$${Number(line.amount).toFixed(2)}` : "No rate set"}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {canManageRates ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelectedQualificationId(qualification.id);
                              setSelectedLineItemId(line.line_item_template_id);
                              setSelectedEquipmentName(qualification.equipment_type.name);
                              setSelectedLineItemName(line.line_item_name);
                              setRateChangeForm((current) => ({
                                ...current,
                                amount: line.amount ? String(line.amount) : "",
                                effective_from: new Date().toISOString().slice(0, 10),
                              }));
                              setRateModalOpen(true);
                            }}
                          >
                            Edit rate
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedQualificationId(qualification.id);
                            setSelectedLineItemId(line.line_item_template_id);
                            setSelectedEquipmentName(qualification.equipment_type.name);
                            setSelectedLineItemName(line.line_item_name);
                            setHistoryModalOpen(true);
                          }}
                        >
                          View history
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {canManageRates && qualification.is_active ? (
                  <div className="mt-3">
                    <Button
                      variant="danger"
                      onClick={() =>
                        deactivateQualificationMutation.mutate({
                          driverId: id,
                          qualificationId: qualification.id,
                        })
                      }
                      loading={deactivateQualificationMutation.isPending}
                    >
                      Deactivate qualification
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {qualifications.length === 0 ? <div className="text-sm text-gray-500">No qualifications found for this driver.</div> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "Insurance Authorizations" ? (
        <div className="space-y-3">
          {companies.map((company) => {
            const existing = authorizations.find((authorization) => authorization.company_id === company.id);
            const rowNotes = authorizationNotesByCompany[company.id] ?? existing?.notes ?? "";
            return (
              <div key={company.id} className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">
                    {company.legal_name} <span className="rounded bg-gray-100 px-2 py-1 text-xs">{company.code}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Authorized at: {existing?.authorized_at ? new Date(existing.authorized_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={existing?.is_authorized ?? false}
                      disabled={!canManageCompanyAuth}
                      onChange={(event) =>
                        upsertCompanyAuthMutation.mutate({
                          driverId: id,
                          body: {
                            company_id: company.id,
                            is_authorized: event.target.checked,
                            notes: rowNotes || undefined,
                          },
                        })
                      }
                    />
                    Authorized
                  </label>
                  <input
                    value={rowNotes}
                    disabled={!canManageCompanyAuth}
                    onChange={(event) =>
                      setAuthorizationNotesByCompany((current) => ({
                        ...current,
                        [company.id]: event.target.value,
                      }))
                    }
                    className="rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
                    placeholder="Notes"
                  />
                  {canManageCompanyAuth ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        upsertCompanyAuthMutation.mutate({
                          driverId: id,
                          body: {
                            company_id: company.id,
                            is_authorized: existing?.is_authorized ?? false,
                            notes: rowNotes || undefined,
                          },
                        })
                      }
                      loading={upsertCompanyAuthMutation.isPending}
                    >
                      Save notes
                    </Button>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-gray-600">Authorized by: {existing?.authorized_by_user_email ?? "—"}</div>
              </div>
            );
          })}
          {companies.length === 0 ? <div className="text-sm text-gray-500">No accessible operating companies.</div> : null}
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
        Last updated by {driver.updated_by_user_id} on {new Date(driver.updated_at).toLocaleString()}
      </div>

      <Modal open={addQualificationOpen} onClose={() => setAddQualificationOpen(false)} title="Add Equipment Qualification">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newQualificationForm.equipment_type_id) {
              pushToast("Select an equipment type", "error");
              return;
            }
            addQualificationMutation.mutate({
              driverId: id,
              body: {
                equipment_type_id: newQualificationForm.equipment_type_id,
                qualified_at: newQualificationForm.qualified_at || undefined,
                notes: newQualificationForm.notes || undefined,
              },
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Equipment type</label>
            <select
              value={newQualificationForm.equipment_type_id}
              onChange={(event) => setNewQualificationForm((current) => ({ ...current, equipment_type_id: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Select equipment type</option>
              {equipmentTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Qualified date</label>
            <input
              type="date"
              value={newQualificationForm.qualified_at}
              onChange={(event) => setNewQualificationForm((current) => ({ ...current, qualified_at: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={newQualificationForm.notes}
              onChange={(event) => setNewQualificationForm((current) => ({ ...current, notes: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddQualificationOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addQualificationMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        title={`${driver.first_name} ${driver.last_name} - ${selectedEquipmentName} - ${selectedLineItemName}`}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rateChangeForm.amount) {
              pushToast("Enter a new amount", "error");
              return;
            }
            if (rateChangeForm.change_reason === "other" && !rateChangeForm.change_notes.trim()) {
              pushToast("Notes are required when reason is Other", "error");
              return;
            }
            changeRateMutation.mutate({
              driverId: id,
              qualificationId: selectedQualificationId,
              body: {
                line_item_template_id: selectedLineItemId,
                amount: Number(rateChangeForm.amount),
                effective_from: rateChangeForm.effective_from,
                change_reason: rateChangeForm.change_reason as
                  | "raise"
                  | "demotion"
                  | "contract_renegotiation"
                  | "annual_adjustment"
                  | "promotion"
                  | "correction"
                  | "other",
                change_notes: rateChangeForm.change_notes || undefined,
              },
            });
          }}
        >
          <div className="text-sm text-gray-700">
            Currently:{" "}
            {selectedRateFromCard?.amount
              ? `$${Number(selectedRateFromCard.amount).toFixed(2)} (since ${formatDate(selectedRateFromCard.effective_from)})`
              : "No current rate"}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">New amount</label>
            <input
              type="number"
              step="0.0001"
              value={rateChangeForm.amount}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, amount: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Effective from</label>
            <input
              type="date"
              value={rateChangeForm.effective_from}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, effective_from: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Change reason</label>
            <select
              value={rateChangeForm.change_reason}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, change_reason: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              {reasonOptions.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={rateChangeForm.change_notes}
              onChange={(event) => setRateChangeForm((current) => ({ ...current, change_notes: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={changeRateMutation.isPending}>
              Submit
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title={`Rate history: ${selectedEquipmentName} - ${selectedLineItemName}`}>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1">Date range</th>
                <th className="py-1">Amount</th>
                <th className="py-1">Reason</th>
                <th className="py-1">Notes</th>
                <th className="py-1">Changed by</th>
                <th className="py-1">Changed at</th>
              </tr>
            </thead>
            <tbody>
              {selectedLineHistory.map((item) => (
                <tr key={`${item.effective_from}-${item.created_at}`} className="border-b border-gray-100">
                  <td className="py-1">{formatDateRange(item.effective_from, item.effective_to)}</td>
                  <td className="py-1">${Number(item.amount).toFixed(2)}</td>
                  <td className="py-1">{item.change_reason}</td>
                  <td className="py-1">{item.change_notes || "—"}</td>
                  <td className="py-1">{item.created_by_user_email || item.created_by_user_id || "—"}</td>
                  <td className="py-1">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {selectedLineHistory.length === 0 ? (
                <tr>
                  <td className="py-2 text-gray-500" colSpan={6}>
                    No rate history found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal open={enableModalOpen} onClose={() => setEnableModalOpen(false)} title="Enable phone login">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Use phone {maskedPhone} from this driver's record?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEnableModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => enablePhoneLoginMutation.mutate()} loading={enablePhoneLoginMutation.isPending}>
              Yes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
