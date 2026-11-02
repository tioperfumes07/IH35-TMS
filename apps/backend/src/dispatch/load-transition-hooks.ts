/** Leaf contract: never import a runtime service here (including through a type import). */
type Client = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };
type LoadActor = { loadId: string; operatingCompanyId: string; actorUserId: string };

export type DriverBillMintOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "already_exists" }
  | { outcome: "minted"; bill_number: string | null; unpriced?: boolean }
  | { outcome: "skipped_no_pay_rate"; reason: string; missing: string[] }
  | { outcome: "awaiting_short_miles"; bill_number: string | null; reason: string }
  | { outcome: "not_minted_salaried"; reason: string };

export type LoadTransitionHooks = {
  ensureDriverBillArtifactsForLoad: (client: Client, input: LoadActor) => Promise<DriverBillMintOutcome>;
  latchOnDeliveryEvidence: (client: Client, input: LoadActor & { targetStatus: string; entryDateIso?: string }) => Promise<"deferred" | "fired" | "skipped">;
};

export function createLoadTransitionHookRegistry() {
  let hooks: Readonly<LoadTransitionHooks> | undefined;
  return {
    register(next: LoadTransitionHooks) {
      if (typeof next.ensureDriverBillArtifactsForLoad !== "function" || typeof next.latchOnDeliveryEvidence !== "function")
        throw new Error("load_transition_hooks_incomplete");
      if (hooks) throw new Error("load_transition_hooks_already_registered");
      hooks = Object.freeze({ ...next });
    },
    get(): Readonly<LoadTransitionHooks> {
      if (!hooks) throw new Error("load_transition_hooks_unregistered");
      return hooks;
    },
  };
}

const registry = createLoadTransitionHookRegistry();
export const registerLoadTransitionHooks = registry.register;
export const getLoadTransitionHooks = registry.get;
