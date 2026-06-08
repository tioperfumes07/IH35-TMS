import { useQuery } from "@tanstack/react-query";

interface Props {
  operatingCompanyId: string;
  crossingPoint: string;
  direction: "northbound" | "southbound";
}

export function CustomsTimePill({ operatingCompanyId, crossingPoint, direction }: Props) {
  const { data } = useQuery({
    queryKey: ["customs-time-avg", operatingCompanyId, crossingPoint, direction],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/border-crossings/customs-time-avg?operating_company_id=${encodeURIComponent(operatingCompanyId)}&crossing=${encodeURIComponent(crossingPoint)}&direction=${direction}`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const avg = data?.data?.avg_minutes;
  if (!avg) return null;

  const color =
    avg < 45
      ? "bg-green-100 text-green-800"
      : avg < 90
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      ~{avg}min customs
    </span>
  );
}
