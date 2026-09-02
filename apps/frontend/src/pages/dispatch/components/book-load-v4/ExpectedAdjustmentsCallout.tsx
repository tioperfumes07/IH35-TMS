import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { detentionReasonsCatalogClient, listAllDispatchCatalogRows } from "../../../../api/catalogs-dispatch";
import { ReferenceSelect } from "../../../../components/parity/ReferenceSelect";
import { MoneyInput } from "../../../../components/forms/MoneyInput";
import { NumberInput } from "../../../../components/forms/NumberInput";

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
          <div className="text-xs font-semibold text-slate-700">Anticipated chargeback</div>
          {/* GO-23 QuickBooks-format fix: was a raw <input type="number"> exposing cents to the
              operator with no $, no thousands separator, and a native spinner -- the same defect
              class MoneyInput/NumberInput already closed everywhere else in this wizard. */}
          <MoneyInput
            valueCents={Number(watch("anticipated_chargeback_cents") ?? 0) || null}
            onChangeCents={(c) => setValue("anticipated_chargeback_cents", c ?? 0, { shouldDirty: true })}
            ariaLabel="Anticipated chargeback"
            className="w-full"
          />
          <input
            {...register("anticipated_chargeback_reason")}
            placeholder="Reason"
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
          />
        </div>
        <div className="space-y-1 p-2">
          <div className="text-xs font-semibold text-slate-700">Detention expected</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("detention_expected_y_n")} />
            Yes
          </label>
          {detentionExpected ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-700">Detention reason</div>
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
          <NumberInput
            value={watch("detention_expected_hours") == null ? null : Number(watch("detention_expected_hours"))}
            onChange={(v) => setValue("detention_expected_hours", v ?? 0, { shouldDirty: true })}
            decimals={2}
            unit="hrs"
            ariaLabel="Detention hours expected"
            className="w-full"
          />
          <MoneyInput
            valueCents={Number(watch("detention_bill_customer_per_hour_cents") ?? 0) || null}
            onChangeCents={(c) => setValue("detention_bill_customer_per_hour_cents", c ?? 0, { shouldDirty: true })}
            placeholder="Bill customer / hr"
            ariaLabel="Detention bill customer per hour"
            className="w-full"
          />
          <MoneyInput
            valueCents={Number(watch("detention_driver_pay_per_hour_cents") ?? 0) || null}
            onChangeCents={(c) => setValue("detention_driver_pay_per_hour_cents", c ?? 0, { shouldDirty: true })}
            placeholder="Driver pay / hr"
            ariaLabel="Detention driver pay per hour"
            className="w-full"
          />
        </div>
        <div className="space-y-1 p-2">
          <div className="text-xs font-semibold text-slate-700">Late delivery risk</div>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("late_delivery_risk_y_n")} />
            Yes
          </label>
          <MoneyInput
            valueCents={Number(watch("late_delivery_est_deduction_cents") ?? 0) || null}
            onChangeCents={(c) => setValue("late_delivery_est_deduction_cents", c ?? 0, { shouldDirty: true })}
            placeholder="Est deduction"
            ariaLabel="Late delivery estimated deduction"
            className="w-full"
          />
          <input {...register("late_delivery_reason")} placeholder="Reason" className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />
        </div>
      </div>
    </div>
  );
}
