import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { z } from "zod";
import { useSearchParams } from "react-router-dom";
import {
  addLineItemTemplate,
  createEquipmentType,
  listEquipmentTypes,
  updateEquipmentType,
  updateLineItemTemplate,
  type EquipmentLineItemTemplate,
  type EquipmentType,
  type LineItemUnit,
} from "../api/catalogs";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { useToast } from "../components/Toast";

const lineItemUnitOptions: Array<{ value: LineItemUnit; label: string }> = [
  { value: "per_loaded_mile", label: "per loaded mile" },
  { value: "per_empty_mile", label: "per empty mile" },
  { value: "per_total_mile", label: "per total mile" },
  { value: "flat_per_occurrence", label: "flat per occurrence" },
  { value: "flat_per_load", label: "flat per load" },
  { value: "percent_of_load_revenue", label: "percent of load revenue" },
  { value: "flat_per_hour", label: "flat per hour" },
];
const lineItemUnitComboboxOptions = lineItemUnitOptions.map((option) => ({ value: option.value, label: option.label }));

const lineItemSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "Code must be uppercase with underscores")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  unit: z.enum([
    "per_loaded_mile",
    "per_empty_mile",
    "per_total_mile",
    "flat_per_occurrence",
    "flat_per_load",
    "percent_of_load_revenue",
    "flat_per_hour",
  ]),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  is_required: z.boolean().default(false),
});

const createEquipmentTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "Code must be uppercase with underscores")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

const updateEquipmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  sort_order: z.coerce.number().int().min(0).max(10000),
  is_active: z.boolean(),
});

const updateLineItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  unit: z.enum([
    "per_loaded_mile",
    "per_empty_mile",
    "per_total_mile",
    "flat_per_occurrence",
    "flat_per_load",
    "percent_of_load_revenue",
    "flat_per_hour",
  ]),
  sort_order: z.coerce.number().int().min(0).max(10000),
  is_required: z.boolean(),
  is_active: z.boolean(),
});

type NewLineItemForm = {
  code: string;
  name: string;
  description: string;
  unit: LineItemUnit;
  sort_order: number;
  is_required: boolean;
};

type CreateEquipmentTypeForm = {
  code: string;
  name: string;
  description: string;
  sort_order: number;
  line_items: NewLineItemForm[];
};

function emptyLineItem(sortOrder = 100): NewLineItemForm {
  return {
    code: "",
    name: "",
    description: "",
    unit: "per_loaded_mile",
    sort_order: sortOrder,
    is_required: false,
  };
}

function lineItemUnitLabel(unit: LineItemUnit) {
  return lineItemUnitOptions.find((option) => option.value === unit)?.label ?? unit;
}

export function EquipmentTypesPage() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const canManage = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const [addEquipmentOpen, setAddEquipmentOpen] = useState(false);
  const [addEquipmentForm, setAddEquipmentForm] = useState<CreateEquipmentTypeForm>({
    code: "",
    name: "",
    description: "",
    sort_order: 100,
    line_items: [emptyLineItem(10)],
  });

  const [editingEquipment, setEditingEquipment] = useState<EquipmentType | null>(null);
  const [editingEquipmentForm, setEditingEquipmentForm] = useState({
    name: "",
    description: "",
    sort_order: 100,
    is_active: true,
  });

  const [lineItemTargetType, setLineItemTargetType] = useState<EquipmentType | null>(null);
  const [addLineItemForm, setAddLineItemForm] = useState<NewLineItemForm>(emptyLineItem());

  const [editingLineItem, setEditingLineItem] = useState<EquipmentLineItemTemplate | null>(null);
  const [editingLineItemForm, setEditingLineItemForm] = useState({
    name: "",
    description: "",
    unit: "per_loaded_mile" as LineItemUnit,
    sort_order: 100,
    is_required: false,
    is_active: true,
  });
  const [searchParams] = useSearchParams();

  const equipmentTypesQuery = useQuery({
    queryKey: ["catalogs", "equipment-types", includeInactive],
    queryFn: () => listEquipmentTypes(includeInactive).then((result) => result.equipment_types),
  });

  const createEquipmentMutation = useMutation({
    mutationFn: createEquipmentType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "equipment-types"] });
      setAddEquipmentOpen(false);
      setAddEquipmentForm({
        code: "",
        name: "",
        description: "",
        sort_order: 100,
        line_items: [emptyLineItem(10)],
      });
      pushToast("Equipment type created", "success");
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; description?: string; sort_order: number; is_active: boolean } }) =>
      updateEquipmentType(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "equipment-types"] });
      setEditingEquipment(null);
      pushToast("Equipment type updated", "success");
    },
  });

  const createLineItemMutation = useMutation({
    mutationFn: ({ equipmentTypeId, payload }: { equipmentTypeId: string; payload: NewLineItemForm }) =>
      addLineItemTemplate(equipmentTypeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "equipment-types"] });
      setLineItemTargetType(null);
      setAddLineItemForm(emptyLineItem());
      pushToast("Line item template added", "success");
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof editingLineItemForm }) => updateLineItemTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogs", "equipment-types"] });
      setEditingLineItem(null);
      pushToast("Line item template updated", "success");
    },
  });

  const rows = useMemo(
    () => (equipmentTypesQuery.data ?? []).filter((typeRow) => typeRow.deactivated_at == null),
    [equipmentTypesQuery.data]
  );

  function toggleExpanded(id: string) {
    setExpandedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (!highlightId) return;
    const el =
      document.getElementById(`equipment-type-${highlightId}`) ??
      document.getElementById(`equipment-line-item-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Equipment Types Catalog"
        subtitle={`${rows.length} registered types`}
        actions={
          <div className="flex items-center gap-2">
            {canManage ? (
              <label className="flex items-center gap-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600">
                <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
                Show inactive
              </label>
            ) : null}
            {canManage ? <ActionButton onClick={() => setAddEquipmentOpen(true)}>+ Create Equipment Type</ActionButton> : null}
          </div>
        }
      />

      {equipmentTypesQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">Loading equipment types...</div>
      ) : (
        <div className="space-y-2">
          {rows.map((typeRow) => {
            const expanded = expandedIds.includes(typeRow.id);
            return (
              <div
                key={typeRow.id}
                id={`equipment-type-${typeRow.id}`}
                className={`rounded border bg-white ${highlightId === typeRow.id ? "border-slate-300 ring-1 ring-slate-400" : "border-gray-200"}`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(typeRow.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{typeRow.code}</span>
                      <span className="text-[13px] font-semibold text-gray-900">{typeRow.name}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          typeRow.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {typeRow.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                      <span>Sort {typeRow.sort_order}</span>
                      <span>•</span>
                      <span>{typeRow.line_items.length} line items</span>
                    </div>
                  </div>
                  {canManage ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setEditingEquipment(typeRow);
                        setEditingEquipmentForm({
                          name: typeRow.name,
                          description: typeRow.description ?? "",
                          sort_order: typeRow.sort_order,
                          is_active: typeRow.is_active,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setEditingEquipment(typeRow);
                          setEditingEquipmentForm({
                            name: typeRow.name,
                            description: typeRow.description ?? "",
                            sort_order: typeRow.sort_order,
                            is_active: typeRow.is_active,
                          });
                        }
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                      title="Edit equipment type"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>

                {expanded ? (
                  <div className="border-t border-gray-200 px-3 py-2">
                    <div className="space-y-1.5">
                      {typeRow.line_items.map((item) => (
                        <div
                          key={item.id}
                          id={`equipment-line-item-${item.id}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded border px-2 py-1 ${
                            highlightId === item.id ? "border-slate-300 bg-slate-100" : "border-gray-200"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{item.code}</span>
                              <span className="text-[13px] text-gray-900">{item.name}</span>
                              {item.is_required ? (
                                <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">Required</span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-500">
                              {lineItemUnitLabel(item.unit)} • sort {item.sort_order}
                            </div>
                          </div>
                          {canManage ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingLineItem(item);
                                setEditingLineItemForm({
                                  name: item.name,
                                  description: item.description ?? "",
                                  unit: item.unit,
                                  sort_order: item.sort_order,
                                  is_required: item.is_required,
                                  is_active: item.is_active,
                                });
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    {canManage ? (
                      <div className="mt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setLineItemTargetType(typeRow);
                            setAddLineItemForm(emptyLineItem(typeRow.line_items.length * 10 + 10));
                          }}
                        >
                          + line item
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {rows.length === 0 ? <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">No equipment types found.</div> : null}
        </div>
      )}

      <Modal open={addEquipmentOpen} onClose={() => setAddEquipmentOpen(false)} title="Create Equipment Type">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = createEquipmentTypeSchema.safeParse(addEquipmentForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await createEquipmentMutation.mutateAsync(parsed.data);
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                const payload = error.data as { error?: string } | undefined;
                pushToast(
                  payload?.error === "equipment_type_name_collision"
                    ? "Equipment type name already exists (duplicate formatting)"
                    : "Equipment type code already exists",
                  "error"
                );
                return;
              }
              pushToast("Failed to create equipment type", "error");
            }
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Code</label>
              <input
                value={addEquipmentForm.code}
                onChange={(event) =>
                  setAddEquipmentForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))
                }
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
                placeholder="DRY_VAN_SPECIAL"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
              <input
                value={addEquipmentForm.name}
                onChange={(event) => setAddEquipmentForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
              <textarea
                value={addEquipmentForm.description}
                onChange={(event) => setAddEquipmentForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Sort order</label>
              <input
                type="number"
                value={addEquipmentForm.sort_order}
                onChange={(event) =>
                  setAddEquipmentForm((current) => ({ ...current, sort_order: Number(event.target.value || "0") }))
                }
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
          </div>

          <div className="space-y-2 rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Line Items</h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setAddEquipmentForm((current) => ({
                    ...current,
                    line_items: [...current.line_items, emptyLineItem(current.line_items.length * 10 + 10)],
                  }))
                }
              >
                Add row
              </Button>
            </div>
            {addEquipmentForm.line_items.map((lineItem, index) => (
              <div key={`${lineItem.code}-${index}`} className="grid grid-cols-1 gap-2 rounded border border-gray-200 p-2 md:grid-cols-6">
                <input
                  value={lineItem.code}
                  onChange={(event) =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((row, rowIdx) =>
                        rowIdx === index ? { ...row, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") } : row
                      ),
                    }))
                  }
                  placeholder="Code"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <input
                  value={lineItem.name}
                  onChange={(event) =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((row, rowIdx) =>
                        rowIdx === index ? { ...row, name: event.target.value } : row
                      ),
                    }))
                  }
                  placeholder="Name"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <Combobox
                  options={lineItemUnitComboboxOptions}
                  value={lineItem.unit}
                  onChange={(nextValue) =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((row, rowIdx) =>
                        rowIdx === index ? { ...row, unit: (nextValue as LineItemUnit) ?? "per_loaded_mile" } : row
                      ),
                    }))
                  }
                  placeholder="Unit"
                />
                <input
                  type="number"
                  value={lineItem.sort_order}
                  onChange={(event) =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((row, rowIdx) =>
                        rowIdx === index ? { ...row, sort_order: Number(event.target.value || "0") } : row
                      ),
                    }))
                  }
                  placeholder="Sort"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={lineItem.is_required}
                    onChange={(event) =>
                      setAddEquipmentForm((current) => ({
                        ...current,
                        line_items: current.line_items.map((row, rowIdx) =>
                          rowIdx === index ? { ...row, is_required: event.target.checked } : row
                        ),
                      }))
                    }
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.filter((_, rowIdx) => rowIdx !== index),
                    }))
                  }
                  disabled={addEquipmentForm.line_items.length === 1}
                >
                  Remove
                </Button>
                <textarea
                  value={lineItem.description}
                  onChange={(event) =>
                    setAddEquipmentForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((row, rowIdx) =>
                        rowIdx === index ? { ...row, description: event.target.value } : row
                      ),
                    }))
                  }
                  rows={2}
                  placeholder="Description (optional)"
                  className="md:col-span-6 rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddEquipmentOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createEquipmentMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editingEquipment !== null} onClose={() => setEditingEquipment(null)} title="Edit Equipment Type">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editingEquipment) return;
            const parsed = updateEquipmentTypeSchema.safeParse(editingEquipmentForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await updateEquipmentMutation.mutateAsync({ id: editingEquipment.id, payload: parsed.data });
            } catch {
              pushToast("Failed to update equipment type", "error");
            }
          }}
        >
          <div className="text-xs text-gray-500">Code: {editingEquipment?.code}</div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
            <input
              value={editingEquipmentForm.name}
              onChange={(event) => setEditingEquipmentForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
            <textarea
              value={editingEquipmentForm.description}
              onChange={(event) => setEditingEquipmentForm((current) => ({ ...current, description: event.target.value }))}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Sort order</label>
              <input
                type="number"
                value={editingEquipmentForm.sort_order}
                onChange={(event) =>
                  setEditingEquipmentForm((current) => ({ ...current, sort_order: Number(event.target.value || "0") }))
                }
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editingEquipmentForm.is_active}
                onChange={(event) => setEditingEquipmentForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingEquipment(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateEquipmentMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={lineItemTargetType !== null} onClose={() => setLineItemTargetType(null)} title="Create Line Item Template">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!lineItemTargetType) return;
            const parsed = lineItemSchema.safeParse(addLineItemForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await createLineItemMutation.mutateAsync({
                equipmentTypeId: lineItemTargetType.id,
                payload: {
                  ...parsed.data,
                  description: parsed.data.description?.trim() || "",
                },
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Line item code already exists for this equipment type", "error");
                return;
              }
              pushToast("Failed to add line item template", "error");
            }
          }}
        >
          <div className="text-xs text-gray-500">Equipment Type: {lineItemTargetType?.code}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Code</label>
              <input
                value={addLineItemForm.code}
                onChange={(event) =>
                  setAddLineItemForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                  }))
                }
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
              <input
                value={addLineItemForm.name}
                onChange={(event) => setAddLineItemForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Unit</label>
              <Combobox
                options={lineItemUnitComboboxOptions}
                value={addLineItemForm.unit}
                onChange={(nextValue) => setAddLineItemForm((current) => ({ ...current, unit: (nextValue as LineItemUnit) ?? "per_loaded_mile" }))}
                placeholder="Select unit"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Sort order</label>
              <input
                type="number"
                value={addLineItemForm.sort_order}
                onChange={(event) => setAddLineItemForm((current) => ({ ...current, sort_order: Number(event.target.value || "0") }))}
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
              <textarea
                value={addLineItemForm.description}
                onChange={(event) => setAddLineItemForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={addLineItemForm.is_required}
                onChange={(event) => setAddLineItemForm((current) => ({ ...current, is_required: event.target.checked }))}
              />
              Required
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLineItemTargetType(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={createLineItemMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editingLineItem !== null} onClose={() => setEditingLineItem(null)} title="Edit Line Item Template">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editingLineItem) return;
            const parsed = updateLineItemSchema.safeParse(editingLineItemForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await updateLineItemMutation.mutateAsync({
                id: editingLineItem.id,
                payload: {
                  ...parsed.data,
                  description: parsed.data.description?.trim() || "",
                },
              });
            } catch {
              pushToast("Failed to update line item template", "error");
            }
          }}
        >
          <div className="text-xs text-gray-500">Code: {editingLineItem?.code}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Name</label>
              <input
                value={editingLineItemForm.name}
                onChange={(event) => setEditingLineItemForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Unit</label>
              <Combobox
                options={lineItemUnitComboboxOptions}
                value={editingLineItemForm.unit}
                onChange={(nextValue) => setEditingLineItemForm((current) => ({ ...current, unit: (nextValue as LineItemUnit) ?? "per_loaded_mile" }))}
                placeholder="Select unit"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Sort order</label>
              <input
                type="number"
                value={editingLineItemForm.sort_order}
                onChange={(event) =>
                  setEditingLineItemForm((current) => ({ ...current, sort_order: Number(event.target.value || "0") }))
                }
                className="w-full rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editingLineItemForm.is_required}
                onChange={(event) => setEditingLineItemForm((current) => ({ ...current, is_required: event.target.checked }))}
              />
              Required
            </label>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
              <textarea
                value={editingLineItemForm.description}
                onChange={(event) => setEditingLineItemForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editingLineItemForm.is_active}
                onChange={(event) => setEditingLineItemForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingLineItem(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateLineItemMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
