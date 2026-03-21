/**
 * PhiClaw — Agent Loader Tests
 *
 * Tests the agent loading, parsing, indexing, and search functionality.
 * Uses the real agents directory for integration-style tests.
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";

// Since we can't use ESM imports easily in test, we'll use a simple test runner
const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, "..", "..", "..");

async function runTests() {
  console.log("🧪 Agent Loader Tests\n");

  // We need to dynamically import since this is ESM-style
  // For testing, we'll use a CommonJS-compatible approach
  const { AgentLoader } = await import("../agent-loader.js");

  const agentsDir = join(PROJECT_ROOT, "agents");
  const loader = new AgentLoader(agentsDir);

  // Test 1: Load agents
  console.log("  ✅ Test: Load agents");
  loader.load();
  assert(loader.count > 100, `Expected 100+ agents, got ${loader.count}`);
  console.log(`     Loaded ${loader.count} agents`);

  // Test 2: Get agent by ID
  console.log("  ✅ Test: Get agent by ID");
  const backend = loader.getAgent("engineering-backend-architect");
  assert(backend !== null, "Backend architect should exist");
  assert.equal(backend!.name, "Backend Architect");
  assert.equal(backend!.division, "engineering");

  // Test 3: Get agent profile (with body)
  console.log("  ✅ Test: Get agent profile with body");
  const profile = loader.getAgentProfile("engineering-backend-architect");
  assert(profile !== null, "Profile should exist");
  assert(profile!.body.length > 100, "Body should be substantial");
  assert(profile!.body.includes("Backend"), "Body should contain agent content");

  // Test 4: List divisions
  console.log("  ✅ Test: List divisions");
  const divisions = loader.listDivisions();
  assert(divisions.length >= 13, `Expected 13+ divisions, got ${divisions.length}`);
  const divNames = divisions.map((d) => d.name);
  assert(divNames.includes("engineering"), "Should have engineering");
  assert(divNames.includes("marketing"), "Should have marketing");
  assert(divNames.includes("design"), "Should have design");

  // Test 5: List agents by division
  console.log("  ✅ Test: List agents by division");
  const engAgents = loader.listAgentsByDivision("engineering");
  assert(engAgents.length >= 20, `Expected 20+ engineering agents, got ${engAgents.length}`);

  const mktAgents = loader.listAgentsByDivision("marketing");
  assert(mktAgents.length >= 25, `Expected 25+ marketing agents, got ${mktAgents.length}`);

  // Test 6: Find agents by query
  console.log("  ✅ Test: Find agents by query");
  const seoResults = loader.findAgents("SEO");
  assert(seoResults.length > 0, "Should find SEO agents");
  assert(seoResults[0].name.toLowerCase().includes("seo"), "First result should be SEO-related");

  const backendResults = loader.findAgents("backend architecture database");
  assert(backendResults.length > 0, "Should find backend agents");

  // Test 7: Find agents by keywords
  console.log("  ✅ Test: Find agents by keywords");
  const keywordResults = loader.findAgentsByKeywords(["seo", "search", "optimization"]);
  assert(keywordResults.length > 0, "Should find agents by keywords");

  // Test 8: Agent has required fields
  console.log("  ✅ Test: Agent has required fields");
  const allAgents = loader.listAllAgents();
  for (const agent of allAgents) {
    assert(agent.id, `Agent missing id`);
    assert(agent.name, `Agent ${agent.id} missing name`);
    assert(agent.description, `Agent ${agent.id} missing description`);
    assert(agent.division, `Agent ${agent.id} missing division`);
    assert(agent.emoji, `Agent ${agent.id} missing emoji`);
    assert(Array.isArray(agent.keywords), `Agent ${agent.id} keywords should be array`);
  }

  // Test 9: Non-existent agent returns null
  console.log("  ✅ Test: Non-existent agent returns null");
  const nonExistent = loader.getAgent("this-agent-does-not-exist");
  assert.equal(nonExistent, null);

  // Test 10: Get summary
  console.log("  ✅ Test: Get summary");
  const summary = loader.getSummary();
  assert(summary.includes("PhiClaw Agent Registry"), "Summary should have header");
  assert(summary.includes("engineering"), "Summary should list engineering");

  // Test 11: Empty query returns all agents
  console.log("  ✅ Test: Empty query returns all agents");
  const emptyResults = loader.findAgents("");
  assert.equal(emptyResults.length, loader.count, "Empty query should return all agents");

  console.log(`\n✅ All ${11} tests passed!\n`);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
