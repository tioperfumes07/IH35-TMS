import type { UseFormRegister } from "react-hook-form";

type Props = {
  register: UseFormRegister<Record<string, unknown>>;
  name: string;
};

export function TimeWindowDropdown({ register, name }: Props) {
  return (
    <select {...register(name)} className="h-8 w-full rounded border border-gray-300 px-2 text-sm">
      <option value="appointment">Appointment (fixed time)</option>
      <option value="open_window">Open window (any time during business hours)</option>
      <option value="select_hours">Select hours (custom window)</option>
      <option value="refused">Refused (customer denied · needs reschedule)</option>
    </select>
  );
}
