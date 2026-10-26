import { registerLoadTransitionHooks } from "./load-transition-hooks.js";

// The composition root owns service dependencies, never the leaf status writer. Resolve the actual
// exports at invocation so test setup does not eagerly cache services ahead of each suite's mocks.
// Both callbacks await the SAME implementations with the SAME caller-owned transaction and input.
// The latch retains its auto-invoice/send/billing-sync chain; settlement void retains the leaf writer.
registerLoadTransitionHooks({
  ensureDriverBillArtifactsForLoad: async (client, input) => {
    const { ensureDriverBillArtifactsForLoad } = await import("./book-load.service.js");
    return ensureDriverBillArtifactsForLoad(client, input);
  },
  latchOnDeliveryEvidence: async (client, input) => {
    const { latchOnDeliveryEvidence } = await import("./delivery-evidence-latch.js");
    return latchOnDeliveryEvidence(client, input);
  },
});
