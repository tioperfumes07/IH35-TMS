import { describe, expect, it } from "vitest";
import {
  dualAckComplete,
  encodeDualAckNotes,
  initialDualAckState,
  parseDualAckNotes,
  withDropoffAck,
  withPickupAck,
} from "../transfer-dual-confirm.js";

describe("transfer-dual-confirm", () => {
  it("round-trips WF047 notes metadata", () => {
    const encoded = encodeDualAckNotes("handoff at yard 3", initialDualAckState());
    expect(parseDualAckNotes(encoded)?.pending_dropoff_ack).toBe(true);
    expect(encoded).toContain("handoff at yard 3");
  });

  it("marks dual ack complete only after dropoff and pickup", () => {
    const afterDropoff = withDropoffAck(initialDualAckState());
    expect(dualAckComplete(afterDropoff)).toBe(false);
    expect(dualAckComplete(withPickupAck(afterDropoff))).toBe(true);
  });

  it("parses legacy transfers without WF047 prefix as null", () => {
    expect(parseDualAckNotes("plain notes")).toBeNull();
  });

  it("treats missing dual ack as incomplete", () => {
    expect(dualAckComplete(null)).toBe(false);
  });
});
