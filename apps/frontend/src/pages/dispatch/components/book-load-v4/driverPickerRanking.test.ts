import { describe, expect, it } from "vitest";
import { driverLoadsFromBoard, rankDriverOptions } from "./driverPickerRanking";

describe("Book Load driver ranking (LEAD 443.257-A item 3)", () => {
  const options = [
    { value: "jorge", label: "Jorge Luis Infante Corona" },
    { value: "concepcion", label: "Concepcion Cordova Dominguez", sublabel: "Samsara 1589367" },
    { value: "rafael", label: "Rafael Rogelio Rivero Reynoso" },
  ];
  const onLoad = driverLoadsFromBoard([
    { assigned_primary_driver_id: "jorge", load_number: "13690", status: "in_transit" } as never,
    { assigned_primary_driver_id: "rafael", load_number: "13001", status: "closed" } as never,
  ]);

  it("usual first, then free, then on-load; labels say why; nobody added or dropped", () => {
    const out = rankDriverOptions(options, { usualDriverId: "concepcion", unitLabel: "T163", onLoadByDriver: onLoad });
    expect(out.map((o) => o.value)).toEqual(["concepcion", "rafael", "jorge"]);
    expect(out[0]!.sublabel).toBe("Usual on T163 · Free · Samsara 1589367");
    expect(out[1]!.sublabel).toBe("Free"); // a closed load does not make a driver busy
    expect(out[2]!.sublabel).toBe("On load 13690");
  });

  it("no usual driver (T122 / T124 — no history): free drivers first, nothing locked", () => {
    const out = rankDriverOptions(options, { usualDriverId: null, unitLabel: "T122", onLoadByDriver: onLoad });
    expect(out.map((o) => o.value)).toEqual(["concepcion", "rafael", "jorge"]);
    expect(out.some((o) => String(o.sublabel ?? "").startsWith("Usual"))).toBe(false);
  });
});
