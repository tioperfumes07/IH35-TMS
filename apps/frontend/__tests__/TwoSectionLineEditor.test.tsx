import { TwoSectionLineEditor } from "../src/components/forms/TwoSectionLineEditor";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

(() => {
  // Smoke contract check for CI/static verification without test runner dependency.
  assert(typeof TwoSectionLineEditor === "function", "TwoSectionLineEditor should export a component function");
})();
