import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitCcBillPayment } from "../api/ccPayment";
export function useCCPayment(operatingCompanyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof submitCcBillPayment>[1]) => submitCcBillPayment(operatingCompanyId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["accounting", "bills-unpaid", operatingCompanyId] }),
  });
}
