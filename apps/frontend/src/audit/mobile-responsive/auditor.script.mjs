#!/usr/bin/env node
/**
 * GAP-91 mobile responsive auditor.
 * Static pass at 375×667 constraints: scans office TMS + driver PWA source for
 * known mobile failure patterns (undersized controls, horizontal overflow hints).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const VIEWPORT = { width: 375, height: 667 };

const SCAN_ROOTS = [
  "apps/frontend/src/pages",
  "apps/frontend/src/components",
  "apps/driver-pwa/src/pages",
  "apps/driver-pwa/src/components",
];

const ISSUE_RULES = [
  {
    id: "button-under-44px",
    test: (content, file) => {
      if (!/\.tsx$/.test(file)) return null;
      if (/min-h-\[(?:4[4-9]|[5-9]\d)\px\]|min-h-11|min-h-12|min-h-14|TouchOptimizedButton|MobileOptimizedTable/.test(content)) {
        return null;
      }
      if (/className="[^"]*\bh-7\b[^"]*"/.test(content) || /className='[^']*\bh-7\b[^']*'/.test(content)) {
        return "Interactive control uses h-7 (<44px touch target)";
      }
      return null;
    },
  },
  {
    id: "input-under-44px",
    test: (content, file) => {
      if (!/\.tsx$/.test(file)) return null;
      if (/type="text"|type='text'|<input/.test(content) && /\bh-8\b|\bh-7\b/.test(content)) {
        return "Text input height may be below 48px on mobile";
      }
      return null;
    },
  },
  {
    id: "table-no-mobile-fallback",
    test: (content, file) => {
      if (!/\.tsx$/.test(file)) return null;
      if (/<table[\s>]/.test(content) && !/MobileOptimizedTable|overflow-x-auto|sm:table|md:table/.test(content)) {
        return "Table without mobile overflow/fallback pattern";
      }
      return null;
    },
  },
  {
    id: "modal-viewport-risk",
    test: (content, file) => {
      if (!/\.tsx$/.test(file)) return null;
      if (/fixed inset-0/.test(content) && !/max-h-\[90vh\]|overflow-y-auto/.test(content)) {
        return "Full-screen overlay may exceed viewport without internal scroll";
      }
      return null;
    },
  },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, files);
    } else if (/\.(tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

export function runAudit() {
  const issues = [];
  const scannedFiles = [];

  for (const scanRoot of SCAN_ROOTS) {
    const abs = path.join(ROOT, scanRoot);
    for (const file of walk(abs)) {
      scannedFiles.push(relative(file));
      const content = fs.readFileSync(file, "utf8");
      for (const rule of ISSUE_RULES) {
        const message = rule.test(content, relative(file));
        if (message) {
          issues.push({
            id: `${rule.id}:${relative(file)}`,
            rule: rule.id,
            file: relative(file),
            message,
            viewport: VIEWPORT,
            suggested_fix: rule.id === "button-under-44px" ? "Use TouchOptimizedButton or min-h-11" : "See gap-91 spec",
            owner_module: scanRoot.includes("driver-pwa") ? "driver-pwa" : "office-tms",
          });
        }
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    viewport: VIEWPORT,
    scanned_file_count: scannedFiles.length,
    issue_count: issues.length,
    issues,
  };
}

export function compareAgainstBaseline(report, baseline) {
  const baselineIds = new Set((baseline?.issues ?? []).map((i) => i.id));
  const reportIds = new Set(report.issues.map((i) => i.id));
  const newIssues = report.issues.filter((issue) => !baselineIds.has(issue.id));
  const resolvedIssues = (baseline?.issues ?? []).filter((issue) => !reportIds.has(issue.id));
  return { newIssues, resolvedIssues };
}

function main() {
  const report = runAudit();
  const outDir = path.join(ROOT, "apps/frontend/src/audit/mobile-responsive");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "latest-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const baselinePath = path.join(outDir, "baseline.json");
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
    : { issues: report.issues };

  const { newIssues } = compareAgainstBaseline(report, baseline);
  console.log(
    `mobile-responsive-audit: scanned=${report.scanned_file_count} issues=${report.issue_count} new_vs_baseline=${newIssues.length}`
  );

  if (process.env.MOBILE_AUDIT_FAIL_ON_NEW === "1" && newIssues.length > 0) {
    console.error("New mobile regressions detected:");
    for (const issue of newIssues.slice(0, 20)) {
      console.error(`  - ${issue.file}: ${issue.message}`);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
