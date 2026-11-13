import type { UseFormRegister } from "react-hook-form";
import { SelectCombobox } from "../../../../components/Combobox";

type Props = {
  register: UseFormRegister<Record<string, unknown>>;
  name: string;
};

export function TimeWindowDropdown({ register, name }: Props) {
  return (
    // ROUND 8.20 board16 Spec — appointment/time window = 150×32 (not h-7 ~28px / 11rem drift).
    <SelectCombobox {...register(name)} className="h-8 w-full max-w-[150px] text-xs" data-testid="book-load-time-window">
      <option value="appointment">Appointment (fixed time)</option>
      <option value="open_window">Open window (any time during business hours)</option>
      <option value="select_hours">Select hours (custom window)</option>
      <option value="refused">Refused (customer denied · needs reschedule)</option>
    </SelectCombobox>
  );
}
