import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { listUsStates } from "../api/catalogs";
import { ApiError } from "../api/client";
import {
  createCustomerContact,
  deactivateCustomerContact,
  getCustomerDetail,
  listVendors,
  listCustomerContacts,
  reactivateCustomerContact,
  updateCustomer,
  updateCustomerContact,
  type Customer,
  type CustomerContact,
  type CustomerContactDepartment,
} from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/layout/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";

const tabs = ["Profile", "Locations", "Loads", "Invoices", "Detention History", "Audit"] as const;
type CustomerTab = (typeof tabs)[number];

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  dot_number: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(50).optional(),
  tax_id: z.string().trim().max(50).optional(),
  billing_state: z.string().trim().max(8).optional(),
  status: z.enum(["active", "inactive", "credit_hold", "blacklist"]),
  customer_type: z.enum(["broker", "direct_shipper"]).optional().or(z.literal("")),
  billing_address: z.string().trim().max(500).optional(),
  website: z.string().trim().max(200).optional(),
  office_phone: z.string().trim().max(50).optional(),
  fax_phone: z.string().trim().max(50).optional(),
  main_contact_name: z.string().trim().max(120).optional(),
  main_contact_title: z.string().trim().max(120).optional(),
  main_contact_email: z.string().trim().email().optional().or(z.literal("")),
  main_contact_phone: z.string().trim().max(50).optional(),
  main_contact_mobile: z.string().trim().max(50).optional(),
  ar_email: z.string().trim().email().optional().or(z.literal("")),
  ar_phone: z.string().trim().max(50).optional(),
  ap_email: z.string().trim().email().optional().or(z.literal("")),
  ap_phone: z.string().trim().max(50).optional(),
  credit_limit: z.string().trim().optional(),
  free_time_pickup_minutes: z.string().trim(),
  free_time_delivery_minutes: z.string().trim(),
  detention_rate_per_hour: z.string().trim(),
  factoring_eligible: z.enum(["true", "false"]),
  factoring_company_vendor_id: z.string().uuid().optional().or(z.literal("")),
  factoring_advance_rate_override: z.string().trim().optional(),
  factoring_reserve_pct_override: z.string().trim().optional(),
  factoring_recourse_type: z.enum(["", "recourse", "non_recourse"]).default(""),
  factoring_notes: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(50).optional(),
  department: z.enum(["sales", "billing", "dispatch", "operations", "owner", "other"]),
  is_primary: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function statusVariant(status: Customer["status"]): "crit" | "warn" | "neutral" | "positive" {
  if (status === "blacklist") return "crit";
  if (status === "credit_hold") return "warn";
  if (status === "inactive") return "neutral";
  return "positive";
}

function statusLabel(status: Customer["status"]) {
  if (status === "credit_hold") return "Credit Hold";
  if (status === "blacklist") return "Blacklist";
  if (status === "inactive") return "Inactive";
  return "Active";
}

function departmentVariant(department: CustomerContactDepartment): "crit" | "warn" | "info" | "positive" | "neutral" {
  if (department === "billing") return "positive";
  if (department === "dispatch") return "warn";
  if (department === "sales") return "info";
  if (department === "owner") return "crit";
  return "neutral";
}

function emptyContactForm() {
  return {
    name: "",
    title: "",
    email: "",
    phone: "",
    mobile: "",
    department: "other",
    is_primary: false,
    notes: "",
  };
}

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<CustomerTab>("Profile");
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [contactForm, setContactForm] = useState(emptyContactForm());
  const [includeInactiveContacts, setIncludeInactiveContacts] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusReason, setStatusReason] = useState("");

  const detailQuery = useQuery({
    queryKey: ["customer-detail", id],
    queryFn: () => getCustomerDetail(id).then((result) => result.customer),
    enabled: Boolean(id),
  });

  const contactsQuery = useQuery({
    queryKey: ["customer-contacts", id, includeInactiveContacts],
    queryFn: () => listCustomerContacts(id, includeInactiveContacts).then((result) => result.contacts),
    enabled: Boolean(id),
  });
  const vendorsQuery = useQuery({
    queryKey: ["vendors", "active", detailQuery.data?.operating_company_id ?? "none"],
    queryFn: () =>
      listVendors({ status: "active", operating_company_id: detailQuery.data?.operating_company_id ?? undefined }).then((result) => result.vendors),
    enabled: Boolean(detailQuery.data?.operating_company_id),
  });
  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });

  const customer = detailQuery.data;
  const contacts = contactsQuery.data ?? customer?.contacts ?? [];
  const factoringVendors = useMemo(
    () =>
      (vendorsQuery.data ?? []).filter((vendor) => {
        const notes = (vendor.notes ?? "").toLowerCase();
        const name = vendor.name.toLowerCase();
        return vendor.vendor_type === "factoring_company" || notes.includes("factor") || name.includes("factor") || name.includes("faro") || name.includes("rts");
      }),
    [vendorsQuery.data]
  );
  const canManageContacts = ["Owner", "Administrator", "Manager"].includes(user?.role ?? "");
  const canViewInactiveContacts = ["Owner", "Administrator"].includes(user?.role ?? "");

  const hydratedForm = useMemo(() => {
    if (!customer) return form;
    if (Object.keys(form).length > 0) return form;
    return {
      name: customer.name ?? "",
      customer_code: customer.customer_code ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      billing_address: customer.billing_address ?? "",
      billing_state: customer.billing_state ?? "",
      dot_number: customer.dot_number ?? "",
      mc_number: customer.mc_number ?? "",
      tax_id: customer.tax_id ?? "",
      status: customer.status,
      customer_type: customer.customer_type ?? "",
      website: customer.website ?? "",
      office_phone: customer.office_phone ?? "",
      fax_phone: customer.fax_phone ?? "",
      main_contact_name: customer.main_contact_name ?? "",
      main_contact_title: customer.main_contact_title ?? "",
      main_contact_email: customer.main_contact_email ?? "",
      main_contact_phone: customer.main_contact_phone ?? "",
      main_contact_mobile: customer.main_contact_mobile ?? "",
      ar_email: customer.ar_email ?? "",
      ar_phone: customer.ar_phone ?? "",
      ap_email: customer.ap_email ?? "",
      ap_phone: customer.ap_phone ?? "",
      credit_limit: customer.credit_limit ? String(customer.credit_limit) : "",
      free_time_pickup_minutes: String(customer.free_time_pickup_minutes ?? 120),
      free_time_delivery_minutes: String(customer.free_time_delivery_minutes ?? 120),
      detention_rate_per_hour: String(customer.detention_rate_per_hour ?? "0"),
      factoring_eligible: customer.factoring_eligible ? "true" : "false",
      factoring_company_vendor_id: customer.factoring_company_vendor_id ?? "",
      factoring_advance_rate_override: customer.factoring_advance_rate_override ? String(customer.factoring_advance_rate_override) : "",
      factoring_reserve_pct_override: customer.factoring_reserve_pct_override ? String(customer.factoring_reserve_pct_override) : "",
      factoring_recourse_type: customer.factoring_recourse_type ?? "",
      factoring_notes: customer.factoring_notes ?? "",
      notes: customer.notes ?? "",
    };
  }, [customer, form]);

  const updateCustomerMutation = useMutation({
    mutationFn: (statusChangeReason?: string) =>
      updateCustomer(id, {
        name: hydratedForm.name,
        customer_code: hydratedForm.customer_code || null,
        email: hydratedForm.email || null,
        phone: hydratedForm.phone || null,
        billing_address: hydratedForm.billing_address || null,
        billing_state: hydratedForm.billing_state || null,
        dot_number: hydratedForm.dot_number || null,
        mc_number: hydratedForm.mc_number || null,
        tax_id: hydratedForm.tax_id || null,
        customer_type: hydratedForm.customer_type ? (hydratedForm.customer_type as "broker" | "direct_shipper") : null,
        status: hydratedForm.status as Customer["status"],
        status_change_reason: statusChangeReason,
        website: hydratedForm.website || null,
        office_phone: hydratedForm.office_phone || null,
        fax_phone: hydratedForm.fax_phone || null,
        main_contact_name: hydratedForm.main_contact_name || null,
        main_contact_title: hydratedForm.main_contact_title || null,
        main_contact_email: hydratedForm.main_contact_email || null,
        main_contact_phone: hydratedForm.main_contact_phone || null,
        main_contact_mobile: hydratedForm.main_contact_mobile || null,
        ar_email: hydratedForm.ar_email || null,
        ar_phone: hydratedForm.ar_phone || null,
        ap_email: hydratedForm.ap_email || null,
        ap_phone: hydratedForm.ap_phone || null,
        credit_limit: hydratedForm.credit_limit ? Number(hydratedForm.credit_limit) : null,
        free_time_pickup_minutes: Number(hydratedForm.free_time_pickup_minutes || "0"),
        free_time_delivery_minutes: Number(hydratedForm.free_time_delivery_minutes || "0"),
        detention_rate_per_hour: Number(hydratedForm.detention_rate_per_hour || "0"),
        factoring_eligible: hydratedForm.factoring_eligible === "true",
        factoring_company_vendor_id: hydratedForm.factoring_company_vendor_id || null,
        factoring_advance_rate_override: hydratedForm.factoring_advance_rate_override ? Number(hydratedForm.factoring_advance_rate_override) : null,
        factoring_reserve_pct_override: hydratedForm.factoring_reserve_pct_override ? Number(hydratedForm.factoring_reserve_pct_override) : null,
        factoring_recourse_type: hydratedForm.factoring_recourse_type ? (hydratedForm.factoring_recourse_type as "recourse" | "non_recourse") : null,
        factoring_notes: hydratedForm.factoring_notes || null,
        notes: hydratedForm.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditMode(false);
      setStatusConfirmOpen(false);
      setStatusReason("");
      pushToast("Customer updated", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Customer conflict detected", "error");
        return;
      }
      pushToast("Failed to update customer", "error");
    },
  });

  const createContactMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCustomerContact>[1]) => createCustomerContact(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      setContactModalOpen(false);
      setEditingContact(null);
      setContactForm(emptyContactForm());
      pushToast("Contact added", "success");
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ contactId, payload }: { contactId: string; payload: Parameters<typeof updateCustomerContact>[2] }) =>
      updateCustomerContact(id, contactId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      setContactModalOpen(false);
      setEditingContact(null);
      pushToast("Contact updated", "success");
    },
  });

  const deactivateContactMutation = useMutation({
    mutationFn: (contactId: string) => deactivateCustomerContact(id, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      pushToast("Contact deactivated", "info");
    },
  });

  const reactivateContactMutation = useMutation({
    mutationFn: (contactId: string) => reactivateCustomerContact(id, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      pushToast("Contact reactivated", "success");
    },
  });

  if (detailQuery.isLoading) return <div className="text-sm text-gray-500">Loading customer...</div>;
  if (!customer) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Customer not found.</div>
        <Button variant="secondary" onClick={() => navigate("/customers")}>
          Back to Customers
        </Button>
      </div>
    );
  }

  async function saveCustomer() {
    if (!customer) return;
    const parsed = customerSchema.safeParse(hydratedForm);
    if (!parsed.success) {
      pushToast(parsed.error.issues[0]?.message ?? "Please correct the form", "error");
      return;
    }
    const statusChanged = parsed.data.status !== customer.status;
    const requiresReason = statusChanged && (parsed.data.status === "credit_hold" || parsed.data.status === "blacklist");
    if (requiresReason) {
      setStatusConfirmOpen(true);
      return;
    }
    await updateCustomerMutation.mutateAsync(undefined);
  }

  const primaryContact = contacts.find((contact) => contact.is_primary && contact.deactivated_at === null);

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/customers"
        title={customer.name}
        subtitle={customer.customer_code ?? "No code"}
        actions={
          !editMode ? (
            <Button onClick={() => setEditMode(true)}>Edit</Button>
          ) : (
            <Button onClick={() => void saveCustomer()} loading={updateCustomerMutation.isPending}>
              Save
            </Button>
          )
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge variant={statusVariant(customer.status)}>{statusLabel(customer.status)}</StatusBadge>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-0.5">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === tab ? "bg-sky-100 text-sky-800" : "text-gray-700 hover:bg-gray-100"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Profile" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <DataPanel title="Identity">
            <Field label="Name" value={hydratedForm.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} disabled={!editMode} />
            <Field label="Code" value={hydratedForm.customer_code} onChange={(value) => setForm((current) => ({ ...current, customer_code: value }))} disabled={!editMode} />
            <Field label="DOT Number" value={hydratedForm.dot_number} onChange={(value) => setForm((current) => ({ ...current, dot_number: value }))} disabled={!editMode} />
            <Field label="MC Number" value={hydratedForm.mc_number} onChange={(value) => setForm((current) => ({ ...current, mc_number: value }))} disabled={!editMode} />
            <Field label="Tax ID (EIN)" value={hydratedForm.tax_id} onChange={(value) => setForm((current) => ({ ...current, tax_id: value }))} disabled={!editMode} />
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Billing State</label>
              <Combobox
                options={(usStatesQuery.data ?? []).map((state) => ({
                  value: state.code,
                  label: `${state.code} - ${state.name}`,
                  sublabel: state.region,
                }))}
                value={hydratedForm.billing_state || null}
                onChange={(nextValue) => setForm((current) => ({ ...current, billing_state: nextValue ?? "" }))}
                loading={usStatesQuery.isLoading}
                disabled={!editMode || usStatesQuery.isError}
                placeholder="Select state"
              />
            </div>
          </DataPanel>

          <DataPanel title="Main Contact">
            <Field label="Name" value={hydratedForm.main_contact_name} onChange={(value) => setForm((current) => ({ ...current, main_contact_name: value }))} disabled={!editMode} />
            <Field label="Title" value={hydratedForm.main_contact_title} onChange={(value) => setForm((current) => ({ ...current, main_contact_title: value }))} disabled={!editMode} />
            <Field label="Email" value={hydratedForm.main_contact_email} onChange={(value) => setForm((current) => ({ ...current, main_contact_email: value }))} disabled={!editMode} />
            <Field label="Phone" value={hydratedForm.main_contact_phone} onChange={(value) => setForm((current) => ({ ...current, main_contact_phone: value }))} disabled={!editMode} />
            <Field label="Mobile" value={hydratedForm.main_contact_mobile} onChange={(value) => setForm((current) => ({ ...current, main_contact_mobile: value }))} disabled={!editMode} />
          </DataPanel>

          <DataPanel title="Billing Endpoints">
            <Field label="A/R Email" value={hydratedForm.ar_email} onChange={(value) => setForm((current) => ({ ...current, ar_email: value }))} disabled={!editMode} />
            <Field label="A/R Phone" value={hydratedForm.ar_phone} onChange={(value) => setForm((current) => ({ ...current, ar_phone: value }))} disabled={!editMode} />
            <Field label="A/P Email" value={hydratedForm.ap_email} onChange={(value) => setForm((current) => ({ ...current, ap_email: value }))} disabled={!editMode} />
            <Field label="A/P Phone" value={hydratedForm.ap_phone} onChange={(value) => setForm((current) => ({ ...current, ap_phone: value }))} disabled={!editMode} />
          </DataPanel>

          <DataPanel title="Detention Configuration">
            <Field
              label="Free Time Pickup (min)"
              value={hydratedForm.free_time_pickup_minutes}
              onChange={(value) => setForm((current) => ({ ...current, free_time_pickup_minutes: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Free Time Delivery (min)"
              value={hydratedForm.free_time_delivery_minutes}
              onChange={(value) => setForm((current) => ({ ...current, free_time_delivery_minutes: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Detention Rate ($/hr)"
              value={hydratedForm.detention_rate_per_hour}
              onChange={(value) => setForm((current) => ({ ...current, detention_rate_per_hour: value }))}
              disabled={!editMode}
              type="number"
            />
          </DataPanel>

          <DataPanel title="Factoring Configuration">
            <div className="mb-2 flex items-center gap-2">
              <input
                id="factoring-eligible"
                type="checkbox"
                checked={hydratedForm.factoring_eligible === "true"}
                onChange={(event) => setForm((current) => ({ ...current, factoring_eligible: event.target.checked ? "true" : "false" }))}
                disabled={!editMode}
              />
              <label htmlFor="factoring-eligible" className="text-xs font-semibold text-gray-600">
                Factoring eligible
              </label>
            </div>
            <SelectField
              label="Factoring Company"
              value={hydratedForm.factoring_company_vendor_id}
              onChange={(value) => setForm((current) => ({ ...current, factoring_company_vendor_id: value }))}
              disabled={!editMode}
              options={[
                { value: "", label: "(none)" },
                ...factoringVendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
              ]}
            />
            <Field
              label="Advance Rate Override (%)"
              value={hydratedForm.factoring_advance_rate_override}
              onChange={(value) => setForm((current) => ({ ...current, factoring_advance_rate_override: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Reserve Override (%)"
              value={hydratedForm.factoring_reserve_pct_override}
              onChange={(value) => setForm((current) => ({ ...current, factoring_reserve_pct_override: value }))}
              disabled={!editMode}
              type="number"
            />
            <SelectField
              label="Recourse Type"
              value={hydratedForm.factoring_recourse_type}
              onChange={(value) => setForm((current) => ({ ...current, factoring_recourse_type: value }))}
              disabled={!editMode}
              options={[
                { value: "", label: "Use default" },
                { value: "recourse", label: "Recourse" },
                { value: "non_recourse", label: "Non-recourse" },
              ]}
            />
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Factoring Notes</label>
              <textarea
                value={hydratedForm.factoring_notes}
                onChange={(event) => setForm((current) => ({ ...current, factoring_notes: event.target.value }))}
                disabled={!editMode}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
              />
            </div>
          </DataPanel>

          <DataPanel title="Notes">
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">General Notes</label>
              <textarea
                value={hydratedForm.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                disabled={!editMode}
                rows={4}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
              />
            </div>
          </DataPanel>

          <div className="lg:col-span-2">
            <DataPanel title={`Contacts (${contacts.length})`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-gray-600">Operational contacts and communication owners</div>
                <div className="flex items-center gap-2">
                  {canViewInactiveContacts ? (
                    <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                      <input type="checkbox" checked={includeInactiveContacts} onChange={(event) => setIncludeInactiveContacts(event.target.checked)} />
                      Show inactive
                    </label>
                  ) : null}
                  {canManageContacts ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingContact(null);
                        setContactForm(emptyContactForm());
                        setContactModalOpen(true);
                      }}
                    >
                      + Add Contact
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                {contacts.map((contact) => (
                  <DataPanelRow key={contact.id}>
                    <div className="flex items-center gap-2 py-1">
                      {contact.is_primary ? <span className="text-xs">⭐</span> : null}
                      <span className="text-[13px] font-semibold text-gray-900">{contact.name}</span>
                      {contact.title ? <span className="text-[11px] text-gray-500">{contact.title}</span> : null}
                      <StatusBadge variant={departmentVariant(contact.department)}>{contact.department}</StatusBadge>
                      {contact.deactivated_at ? <StatusBadge variant="neutral">inactive</StatusBadge> : null}
                    </div>
                    <div className="flex items-center gap-1 py-1">
                      {canManageContacts ? (
                        !contact.deactivated_at ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingContact(contact);
                                setContactForm({
                                  name: contact.name,
                                  title: contact.title ?? "",
                                  email: contact.email ?? "",
                                  phone: contact.phone ?? "",
                                  mobile: contact.mobile ?? "",
                                  department: contact.department,
                                  is_primary: contact.is_primary,
                                  notes: contact.notes ?? "",
                                });
                                setContactModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => deactivateContactMutation.mutate(contact.id)}>
                              Deactivate
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => reactivateContactMutation.mutate(contact.id)}>
                            Reactivate
                          </Button>
                        )
                      ) : null}
                    </div>
                  </DataPanelRow>
                ))}
              </div>
            </DataPanel>
          </div>
        </div>
      ) : null}

      {activeTab !== "Profile" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">{activeTab} view will be delivered in the next block. The tab is intentionally present to preserve the final information architecture.</div>
      ) : null}

      <Modal open={contactModalOpen} onClose={() => setContactModalOpen(false)} title={editingContact ? "Edit Contact" : "Add Contact"}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = contactSchema.safeParse(contactForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }

            if (parsed.data.is_primary && primaryContact && primaryContact.id !== editingContact?.id) {
              pushToast(`Primary contact will be replaced (${primaryContact.name})`, "info");
            }

            if (!editingContact) {
              await createContactMutation.mutateAsync({
                ...parsed.data,
                email: parsed.data.email || undefined,
                title: parsed.data.title || undefined,
                phone: parsed.data.phone || undefined,
                mobile: parsed.data.mobile || undefined,
                notes: parsed.data.notes || undefined,
              });
              return;
            }

            await updateContactMutation.mutateAsync({
              contactId: editingContact.id,
              payload: {
                ...parsed.data,
                title: parsed.data.title || null,
                email: parsed.data.email || null,
                phone: parsed.data.phone || null,
                mobile: parsed.data.mobile || null,
                notes: parsed.data.notes || null,
              },
            });
          }}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Name" value={contactForm.name} onChange={(value) => setContactForm((current) => ({ ...current, name: value }))} />
            <Field label="Title" value={contactForm.title} onChange={(value) => setContactForm((current) => ({ ...current, title: value }))} />
            <Field label="Email" value={contactForm.email} onChange={(value) => setContactForm((current) => ({ ...current, email: value }))} />
            <Field label="Phone" value={contactForm.phone} onChange={(value) => setContactForm((current) => ({ ...current, phone: value }))} />
            <Field label="Mobile" value={contactForm.mobile} onChange={(value) => setContactForm((current) => ({ ...current, mobile: value }))} />
            <SelectField
              label="Department"
              value={contactForm.department}
              onChange={(value) => setContactForm((current) => ({ ...current, department: value as CustomerContactDepartment }))}
              options={[
                { value: "sales", label: "Sales" },
                { value: "billing", label: "Billing" },
                { value: "dispatch", label: "Dispatch" },
                { value: "operations", label: "Operations" },
                { value: "owner", label: "Owner" },
                { value: "other", label: "Other" },
              ]}
            />
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={contactForm.is_primary} onChange={(event) => setContactForm((current) => ({ ...current, is_primary: event.target.checked }))} />
              Primary contact
            </label>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Notes</label>
              <textarea
                value={contactForm.notes}
                onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setContactModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createContactMutation.isPending || updateContactMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={statusConfirmOpen} onClose={() => setStatusConfirmOpen(false)} title="Confirm Status Change">
        <div className="space-y-3">
          <p className="text-[13px] text-gray-700">
            Changing this customer to <strong>{statusLabel((hydratedForm.status as Customer["status"]) ?? customer.status)}</strong> can block dispatch unless overridden.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Reason</label>
            <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!statusReason.trim()) {
                  pushToast("Reason is required for credit hold/blacklist", "error");
                  return;
                }
                updateCustomerMutation.mutate(statusReason.trim());
              }}
              loading={updateCustomerMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
