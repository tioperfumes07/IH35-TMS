import { runLovesCardImportTick } from "./loves-card-import.js";

async function main() {
  const result = await runLovesCardImportTick();
  console.log("[loves-card-import]", JSON.stringify(result));
  if (result.status === "disabled") {
    process.exitCode = 0;
    return;
  }
}

main().catch((error) => {
  console.error("[loves-card-import] failed", error);
  process.exitCode = 1;
});
