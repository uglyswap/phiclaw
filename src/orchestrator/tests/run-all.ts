/**
 * PhiClaw — Test Runner
 *
 * Runs all test suites in sequence.
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";

const TESTS_DIR = import.meta.dirname ?? dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(TESTS_DIR, "..", "..", "..");

const testFiles = [
  "agent-loader.test.ts",
  "router.test.ts",
  "ontology.test.ts",
  "memory-learning.test.ts",
  "orchestrator.test.ts",
];

console.log("═══════════════════════════════════════");
console.log("  PhiClaw Test Suite");
console.log("═══════════════════════════════════════\n");

let passed = 0;
let failed = 0;

for (const testFile of testFiles) {
  const filePath = join(TESTS_DIR, testFile);
  console.log(`\n────────────────────────────────────────`);
  console.log(`Running: ${testFile}`);
  console.log(`────────────────────────────────────────\n`);

  try {
    execSync(`npx tsx ${filePath}`, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test" },
    });
    passed++;
  } catch (err) {
    failed++;
    console.error(`\n❌ FAILED: ${testFile}\n`);
  }
}

console.log("\n═══════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
