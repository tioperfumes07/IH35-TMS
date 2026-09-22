import { i8DispatchedLoadComplete } from "./invariants/i8-dispatched-load-complete.js";
import type { Invariant } from "./types.js";

/** Every invariant the reconciler asserts. An invariant lands here with its guard ceiling in
 *  scripts/verify-reconciler-exceptions.baseline.json in the same PR. */
export const RECONCILER_INVARIANTS: readonly Invariant[] = [i8DispatchedLoadComplete];
