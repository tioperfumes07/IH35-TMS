import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { detentionReasonsCatalogClient, listAllDispatchCatalogRows } from "../../../../api/catalogs-dispatch";
import { ReferenceSelect } from "../../../../components/parity/ReferenceSelect";

type Props = {
  register: UseFormRegister<Record<string, unknown>>;
  operatingCompanyId: string;
  watch: UseFormWatch<Record<string, unknown>>;
  setValue: UseFormSetValue<Record<string, unknown>>;
};

export function ExpectedAdjustmentsCallout({ register, operatingCompanyId, watch, setValue }: Props) {
  const queryClient = useQueryClient();
  const detentionExpected = Boolean(watch("detention_expected_y_n"));
  const detentionReasonId = String(watch("detention_reason_id") ?? "");

  const detentionReasonsQuery = useQuery({
    queryKey: ["book-load", "detention-reasons", operatingCompanyId],
    queryFn: () =>
      listAllDispatchCatalogRows(detentionReasonsCatalogClient, {
        operating_company_id: operatingCompanyId,
        is_active: "true",
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const detentionReasonRows = detentionReasonsQuery.data?.rows ?? [];

  const detentionReasonOptions = useMemo(
    () =>
      detentionReasonRows.map((row) => ({
        value: row.id,
        label: row.display_name,
      })),
    [detentionReasonRows]
  );

  return (
    <div className="rounded-sm border border-slate-200 bg-[#FEF3C7] px-3 py-2 text-[11px] text-slate-700">
      <div className="mb-2 font-semibold uppercase tracking-wide">Expected adjustments</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="space-y-1 p-2">
          <div className="text-[10px] font-semibold text-slate-700">Anticipated chargeback</div>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="cents"
            {...register("anticipated_chargeback_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          <input
            {...register("anticipated_chargeback_reason")}
            placeholder="Reason"
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1 p-2">
          <div className="text-[10px] font-semibold text-slate-700">Detention expected</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("detention_expected_y_n")} />
            Yes
          </label>
          {detentionExpected ? (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-700">Detention reason</div>
              {/*
                LST-PICKER-01: Book Load detention reason — ReferenceSelect first-row create → POST
                catalogs.detention_reasons (same table Lists → Detention Reasons reads). Options keyed by UUID.
              */}
              <ReferenceSelect
                value={detentionReasonId || null}
                onChange={(next) => setValue("detention_reason_id", next ?? "", { shouldDirty: true })}
                options={detentionReasonOptions}
                createKind="detention_reason"
                operatingCompanyId={operatingCompanyId}
                createdValueField="id"
                loading={detentionReasonsQuery.isLoading}
                disabled={detentionReasonsQuery.isLoading || detentionReasonsQuery.isError}
                placeholder="Select reason"
                onOptionCreated={() => {
                  void detentionReasonsQuery.refetch();
                  void queryClient.invalidateQueries({ queryKey: ["book-load", "detention-reasons", operatingCompanyId] });
                }}
              />
              {detentionReasonsQuery.isError ? (
                <div className="bg-red-50 p-2 text-[11px] text-red-700" role="alert">
                  <div>Couldn't load detention reasons.</div>
                  <button
                    type="button"
                    className="mt-1 font-semibold underline"
                    onClick={() => void detentionReasonsQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <input
            type="number"
            min={0}
            step={0.25}
            placeholder="Hours"
            {...register("detention_expected_hours", { valueAsNumber: true })}
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Bill customer ¢/hr"
            {...register("detention_bill_customer_per_hour_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="Driver pay ¢/hr"
            {...register("detention_driver_pay_per_hour_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1 p-2">
          <div className="text-[10px] font-semibold text-slate-700">Late delivery risk</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("late_delivery_risk_y_n")} />
            Yes
          </label>
          <input
            type="number"
            min={0}
            placeholder="Est deduction (¢)"
            {...register("late_delivery_est_deduction_cents", { valueAsNumber: true })}
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          <input {...register("late_delivery_reason")} placeholder="Reason" className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
        </div>
      </div>
    </div>
  );
}
