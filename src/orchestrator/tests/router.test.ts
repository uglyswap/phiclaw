/**
 * PhiClaw — Router Tests
 *
 * Tests the multi-signal routing algorithm.
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, "..", "..", "..");

async function runTests() {
  console.log("🧪 Router Tests\n");

  const { AgentLoader } = await import("../agent-loader.js");
  const { Router } = await import("../router.js");

  const loader = new AgentLoader(join(PROJECT_ROOT, "agents"));
  loader.load();
  const router = new Router(loader);

  // Test 1: Route SEO task
  console.log("  ✅ Test: Route SEO task");
  const seoResult = router.routeByQuery("optimize search engine rankings and improve organic traffic");
  assert(seoResult.agents.length > 0, "Should find agents for SEO");
  const seoNames = seoResult.agents.map((a) => a.name.toLowerCase());
  assert(
    seoNames.some((n) => n.includes("seo")),
    `Expected SEO agent in results, got: ${seoNames.join(", ")}`,
  );

  // Test 2: Route backend task
  console.log("  ✅ Test: Route backend task");
  const backendResult = router.routeByQuery("design a scalable API architecture with database schema");
  assert(backendResult.agents.length > 0, "Should find agents for backend");
  assert(backendResult.matchedDivision === "engineering", `Expected engineering division, got ${backendResult.matchedDivision}`);

  // Test 3: Route design task
  console.log("  ✅ Test: Route design task");
  const designResult = router.routeByQuery("create UI wireframes and user experience flow");
  assert(designResult.agents.length > 0, "Should find agents for design");

  // Test 4: Route sales task
  console.log("  ✅ Test: Route sales task");
  const salesResult = router.routeByQuery("build a sales pipeline and outbound prospecting strategy");
  assert(salesResult.agents.length > 0, "Should find agents for sales");
  assert(
    salesResult.matchedDivision === "sales",
    `Expected sales division, got ${salesResult.matchedDivision}`,
  );

  // Test 5: Route game development task
  console.log("  ✅ Test: Route game development task");
  const gameResult = router.routeByQuery("create a multiplayer game in Unity with shader effects");
  assert(gameResult.agents.length > 0, "Should find agents for game dev");
  assert(
    gameResult.matchedDivision === "game-development",
    `Expected game-development division, got ${gameResult.matchedDivision}`,
  );

  // Test 6: Max agents limit
  console.log("  ✅ Test: Max agents limit");
  const limitedResult = router.routeByQuery("marketing strategy", 2);
  assert(limitedResult.agents.length <= 2, "Should respect max agents limit");

  // Test 7: Scores are populated
  console.log("  ✅ Test: Scores are populated");
  const scoredResult = router.routeByQuery("SEO content optimization");
  assert(scoredResult.scores.size > 0, "Should have scores");
  for (const agent of scoredResult.agents) {
    assert((scoredResult.scores.get(agent.id) ?? 0) > 0, `Agent ${agent.id} should have positive score`);
  }

  // Test 8: Route with no match still returns something
  console.log("  ✅ Test: Empty/obscure query");
  const obscureResult = router.routeByQuery("xyzzy plugh");
  // Should not crash, may return 0 results
  assert(Array.isArray(obscureResult.agents), "Should return array even for obscure query");

  console.log(`\n✅ All ${8} tests passed!\n`);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
