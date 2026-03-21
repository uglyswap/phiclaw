/**
 * PhiClaw — Memory & Auto-Learning Tests
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";

async function runTests() {
  console.log("🧪 Memory & Auto-Learning Tests\n");

  const { MemoryStore } = await import("../memory.js");
  const { AutoLearningEngine } = await import("../auto-learning.js");

  const tempDir = join("/tmp", `phiclaw-test-${Date.now()}`);

  try {
    // ─── Memory Store Tests ──────────────────────────────────

    console.log("  --- Memory Store ---");

    const memory = new MemoryStore({
      storageDir: join(tempDir, "memory"),
      maxEntries: 100,
      persistToDisk: true,
    });

    // Test 1: Record orchestration
    console.log("  ✅ Test: Record orchestration");
    memory.recordOrchestration({
      plan: {
        id: "plan-test-1",
        objective: "Build a landing page",
        tasks: [],
        executionMode: "sequential",
        estimatedDuration: "1h",
        requiredAgents: ["engineering-frontend-developer"],
        createdAt: new Date().toISOString(),
      },
      status: "completed",
      deliverable: "A beautiful landing page was built...",
      summary: "1 task completed",
      totalDurationMs: 5000,
      taskResults: [
        {
          taskId: "task-1",
          taskDescription: "Build the landing page",
          agentNames: ["Frontend Developer"],
          status: "completed",
          result: "Landing page built with React",
          durationMs: 5000,
        },
      ],
      completedAt: new Date().toISOString(),
    });

    // Test 2: Search orchestrations
    console.log("  ✅ Test: Search orchestrations");
    const searchResults = memory.searchOrchestrations("landing");
    assert.equal(searchResults.length, 1);
    assert(searchResults[0].objective.includes("landing"));

    // Test 3: Get recent orchestrations
    console.log("  ✅ Test: Get recent orchestrations");
    const recent = memory.getRecentOrchestrations(5);
    assert.equal(recent.length, 1);

    // Test 4: Agent performance
    console.log("  ✅ Test: Agent performance");
    const perf = memory.getAgentPerformance("frontend-developer");
    assert.equal(perf.totalTasks, 1);
    assert.equal(perf.successRate, 1);

    // Test 5: Stats
    console.log("  ✅ Test: Memory stats");
    const stats = memory.getStats();
    assert.equal(stats.totalOrchestrations, 1);
    assert.equal(stats.totalAgentExecutions, 1);

    // Test 6: Persistence
    console.log("  ✅ Test: Memory persistence");
    const memory2 = new MemoryStore({
      storageDir: join(tempDir, "memory"),
      maxEntries: 100,
      persistToDisk: true,
    });
    memory2.initialize();
    const reloaded = memory2.getRecentOrchestrations(5);
    assert.equal(reloaded.length, 1, "Should persist across instances");

    // ─── Auto-Learning Tests ──────────────────────────────────

    console.log("\n  --- Auto-Learning ---");

    const learning = new AutoLearningEngine({
      enabled: true,
      storageDir: join(tempDir, "learnings"),
      maxLearnings: 100,
      learnFromFailures: true,
      learnFromSuccesses: true,
      trackPerformance: true,
    });

    // Test 7: Process orchestration with mixed results
    console.log("  ✅ Test: Process orchestration results");
    const newLearnings = learning.processOrchestrationResult({
      plan: {
        id: "plan-test-2",
        objective: "Launch marketing campaign",
        tasks: [],
        executionMode: "sequential",
        estimatedDuration: "2h",
        requiredAgents: [],
        createdAt: new Date().toISOString(),
      },
      status: "partial",
      deliverable: "Partial results...",
      summary: "1 success, 1 failure",
      totalDurationMs: 10000,
      taskResults: [
        {
          taskId: "task-1",
          taskDescription: "Create SEO strategy",
          agentNames: ["SEO Specialist"],
          status: "completed",
          result: "SEO strategy created",
          durationMs: 5000,
        },
        {
          taskId: "task-2",
          taskDescription: "Write social media posts",
          agentNames: ["Social Media Strategist"],
          status: "failed",
          result: "",
          error: "Timeout: task took too long",
          durationMs: 5000,
        },
      ],
      completedAt: new Date().toISOString(),
    });
    assert(newLearnings.length >= 2, `Expected 2+ learnings, got ${newLearnings.length}`);

    // Test 8: Get learnings by category
    console.log("  ✅ Test: Get learnings by category");
    const failures = learning.getLearnings("task-failure");
    assert(failures.length >= 1, "Should have failure learnings");

    const successes = learning.getLearnings("task-success-pattern");
    assert(successes.length >= 1, "Should have success learnings");

    // Test 9: Record user correction
    console.log("  ✅ Test: Record user correction");
    learning.recordUserCorrection("Use the Content Creator agent for blog posts, not SEO Specialist", {
      orchestrationId: "plan-test-2",
    });
    const corrections = learning.getLearnings("user-correction");
    assert.equal(corrections.length, 1);

    // Test 10: Search learnings
    console.log("  ✅ Test: Search learnings");
    const searchLearnings = learning.searchLearnings("SEO");
    assert(searchLearnings.length >= 1);

    // Test 11: Stats
    console.log("  ✅ Test: Learning stats");
    const learnStats = learning.getStats();
    assert(learnStats.totalLearnings >= 3);
    assert(learnStats.agentPerformance.length >= 1);

    // Test 12: Format summary
    console.log("  ✅ Test: Format summary");
    const summary = learning.formatSummary();
    assert(summary.includes("Auto-Learning Summary"));

    // Test 13: Agent recommendations
    console.log("  ✅ Test: Agent recommendations");
    const recs = learning.getAgentRecommendations("SEO strategy optimization");
    // May or may not have recommendations depending on pattern matching
    assert(Array.isArray(recs), "Should return array");

    // Test 14: Persistence
    console.log("  ✅ Test: Learning persistence");
    const learning2 = new AutoLearningEngine({
      enabled: true,
      storageDir: join(tempDir, "learnings"),
      maxLearnings: 100,
      learnFromFailures: true,
      learnFromSuccesses: true,
      trackPerformance: true,
    });
    learning2.initialize();
    const reloadedLearnings = learning2.getLearnings();
    assert(reloadedLearnings.length >= 3, "Should persist learnings");

    console.log(`\n✅ All ${14} tests passed!\n`);
  } finally {
    // Cleanup
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
