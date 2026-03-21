/**
 * PhiClaw — Orchestrator End-to-End Tests
 *
 * Tests the full orchestration pipeline: plan → route → execute → compile.
 * Uses the NOOP_LLM_CALLER for deterministic testing.
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, "..", "..", "..");

async function runTests() {
  console.log("🧪 Orchestrator E2E Tests\n");

  const { AgentLoader } = await import("../agent-loader.js");
  const { Orchestrator } = await import("../index.js");
  const { Planner } = await import("../planner.js");
  const { Compiler } = await import("../compiler.js");
  const { PromptEngineer } = await import("../prompt-engineer.js");

  const loader = new AgentLoader(join(PROJECT_ROOT, "agents"));
  loader.load();

  // Test 1: Create orchestrator
  console.log("  ✅ Test: Create orchestrator");
  const orchestrator = new Orchestrator(loader);
  assert(orchestrator.agentCount > 100, "Should have 100+ agents");

  // Test 2: Dry-run orchestration
  console.log("  ✅ Test: Dry-run orchestration");
  const dryResult = await orchestrator.orchestrate(
    "Build a comprehensive marketing strategy for a B2B SaaS product",
    undefined,
    { dryRun: true, skipPromptEngineering: true },
  );
  assert.equal(dryResult.status, "completed");
  assert(dryResult.deliverable.includes("Orchestration Plan"), "Dry run should return plan");
  assert(dryResult.plan.tasks.length > 0, "Plan should have tasks");

  // Test 3: Full orchestration (with NOOP caller)
  console.log("  ✅ Test: Full orchestration with NOOP caller");
  const result = await orchestrator.orchestrate(
    "Launch proprietaire.net in the French market",
    undefined,
    { skipPromptEngineering: true },
  );
  assert(["completed", "partial"].includes(result.status), `Status should be completed/partial, got ${result.status}`);
  assert(result.taskResults.length > 0, "Should have task results");
  assert(result.deliverable.length > 0, "Should have a deliverable");
  assert(result.totalDurationMs >= 0, "Should have duration");

  // Test 4: Orchestration events
  console.log("  ✅ Test: Orchestration events");
  const events: string[] = [];
  const eventOrchestrator = new Orchestrator(loader);
  eventOrchestrator.onEvent((event) => events.push(event.type));
  await eventOrchestrator.orchestrate("Test event emission", undefined, { skipPromptEngineering: true });
  assert(events.includes("plan-created"), "Should emit plan-created");
  assert(events.includes("task-started"), "Should emit task-started");

  // Test 5: Plan formatting
  console.log("  ✅ Test: Plan formatting");
  const planner = new Planner(loader);
  const plan = planner.createFallbackPlan("Build a landing page with SEO");
  const formatted = planner.formatPlan(plan);
  assert(formatted.includes("Orchestration Plan"), "Formatted plan should have header");
  assert(formatted.includes("task-"), "Should list tasks");

  // Test 6: Result formatting for chat
  console.log("  ✅ Test: Result formatting for chat");
  const compiler = new Compiler(loader);
  const chatResult = await compiler.compile(result.plan, result.taskResults);
  const chatFormatted = compiler.formatForChat(chatResult);
  assert(chatFormatted.length > 0, "Chat format should not be empty");
  assert(chatFormatted.includes("Orchestration"), "Should mention orchestration");

  // Test 7: Prompt Engineer (rule-based)
  console.log("  ✅ Test: Prompt Engineer (rule-based)");
  const pe = new PromptEngineer(loader, undefined, { useLLM: false });
  const engineered = pe.engineerWithRules("Create a comprehensive SEO strategy for my SaaS website");
  assert(engineered.intent.action === "create", `Expected 'create' action, got '${engineered.intent.action}'`);
  assert(engineered.suggestedAgentIds.length > 0, "Should suggest agents");
  assert(engineered.engineeredPrompt.includes("Objective"), "Engineered prompt should be structured");

  // Test 8: Prompt Engineer intent detection
  console.log("  ✅ Test: Prompt Engineer intent detection");
  const analyzeResult = pe.engineerWithRules("Analyze the performance of my marketing campaigns");
  assert.equal(analyzeResult.intent.action, "analyze");

  const fixResult = pe.engineerWithRules("Fix the broken database connection");
  assert.equal(fixResult.intent.action, "fix");

  const planResult = pe.engineerWithRules("Plan a roadmap for Q2");
  assert.equal(planResult.intent.action, "plan");

  // Test 9: History tracking
  console.log("  ✅ Test: History tracking");
  const history = orchestrator.getHistory();
  assert(history.length >= 1, "Should have at least 1 history entry");

  // Test 10: Agent search
  console.log("  ✅ Test: Agent search");
  const agents = orchestrator.findAgents("product manager");
  assert(agents.length > 0, "Should find product manager");
  assert(
    agents[0].name.toLowerCase().includes("product"),
    `First result should be product-related, got ${agents[0].name}`,
  );

  // Test 11: Route query
  console.log("  ✅ Test: Route query");
  const routeResult = orchestrator.routeQuery("database optimization and indexing");
  assert(routeResult.agents.length > 0, "Should route to agents");

  // Test 12: Division listing
  console.log("  ✅ Test: Division listing");
  const divisions = orchestrator.listDivisions();
  assert(divisions.length >= 13, "Should have 13+ divisions");

  // Test 13: Memory store
  console.log("  ✅ Test: Memory store");
  const memory = orchestrator.getMemory();
  const recent = memory.getRecentOrchestrations(5);
  assert(recent.length >= 1, "Should have recent orchestrations");

  // Test 14: Auto-learning
  console.log("  ✅ Test: Auto-learning");
  const learning = orchestrator.getAutoLearning();
  const stats = learning.getStats();
  assert(typeof stats.totalLearnings === "number", "Stats should have totalLearnings");

  // Test 15: Configuration
  console.log("  ✅ Test: Configuration");
  const config = orchestrator.getConfig();
  assert(config.enabled === true, "Should be enabled by default");
  assert(config.maxConcurrentTasks > 0, "Should have positive concurrent limit");

  console.log(`\n✅ All ${15} tests passed!\n`);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
