import { PartLocationMapDialog } from "../src/components/forms/PartLocationMapDialog";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

(() => {
  // Smoke contract check for CI/static verification without test runner dependency.
  assert(typeof PartLocationMapDialog === "function", "PartLocationMapDialog should export a component function");
})();
