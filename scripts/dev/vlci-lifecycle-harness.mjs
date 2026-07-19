/**
 * Test harness: owns a VLCI session with a fake dataDir (no Postgres), prints READY,
 * holds until timeout or signal. Used to prove SIGINT/SIGTERM cleanup.
 *
 * Usage:
 *   node scripts/dev/vlci-lifecycle-harness.mjs --hold-ms 5000
 *   IH35_VLCI_HARNESS_REPO=/tmp/x node ...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOwnerSession,
  installLifecycleCleanupHandlers,
} from "../vlci-lifecycle.mjs";

const ROOT = process.env.IH35_VLCI_HARNESS_REPO
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function argNum(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return fallback;
}

const holdMs = argNum("--hold-ms", 3000);
const session = createOwnerSession(ROOT);
const dataDir = fs.mkdtempSync(path.join(session.tempRoot, "harness-data-"));
fs.chmodSync(dataDir, 0o700);
fs.writeFileSync(path.join(dataDir, "marker"), "owned\n", { encoding: "utf8", mode: 0o600 });
const port = 59000 + (process.pid % 1000);
const url = `postgresql://harness@127.0.0.1:${port}/ih35_verify`;
session.updateBindings({ dataDir, port, database: "ih35_verify", url });

const handlers = installLifecycleCleanupHandlers(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
  session.release();
  // Marker file for tests: parent can observe cleanup completed.
  const donePath = process.env.IH35_VLCI_HARNESS_DONE;
  if (donePath) {
    let doneFd;
    try {
      const noFollow = fs.constants.O_NOFOLLOW ?? 0;
      doneFd = fs.openSync(
        donePath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
        0o600
      );
      fs.writeFileSync(
        doneFd,
        JSON.stringify({ cleaned: true, pid: process.pid, dataDir, lockPath: session.lockPath }),
        "utf8"
      );
    } catch { /* ignore */ } finally {
      if (doneFd != null) fs.closeSync(doneFd);
    }
  }
}, { exit: true });

process.stdout.write(
  JSON.stringify({
    ready: true,
    pid: process.pid,
    lockPath: session.lockPath,
    dataDir,
    port,
    token: session.token,
  }) + "\n"
);

// Keep the event loop alive (do NOT unref) so SIGINT/SIGTERM can be delivered during hold.
setTimeout(() => {
  handlers.runCleanup("timeout");
  handlers.dispose();
  process.exit(0);
}, holdMs);
