import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";

type Props = {
  companyId: string;
  value: string;
  onChange: (driverId: string, driverName: string) => void;
  placeholder?: string;
};

export function DriverAutocomplete({ companyId, value, onChange, placeholder = "Search driver by name" }: Props) {
  const [search, setSearch] = useState("");

  const driversQuery = useQuery({
    queryKey: ["factoring", "driver-autocomplete", companyId, search],
    queryFn: () => listDrivers({ operating_company_id: companyId, search: search || undefined, status: "active" }).then((res) => res.drivers),
    enabled: Boolean(companyId),
  });

  const selectedName = useMemo(() => {
    const match = (driversQuery.data ?? []).find((driver) => driver.id === value);
    return match ? `${match.first_name} ${match.last_name}`.trim() : "";
  }, [driversQuery.data, value]);

  return (
    <div className="space-y-1" data-driver-autocomplete="true">
      <input
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedName}
        placeholder={placeholder}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim() ? (
        <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-white">
          {(driversQuery.data ?? []).slice(0, 20).map((driver) => (
            <button
              key={driver.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(driver.id, `${driver.first_name} ${driver.last_name}`.trim());
                setSearch("");
              }}
            >
              {`${driver.first_name} ${driver.last_name}`.trim() || driver.id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
