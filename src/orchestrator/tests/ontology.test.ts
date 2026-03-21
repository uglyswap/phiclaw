/**
 * PhiClaw — Ontology Tests
 *
 * Tests the knowledge graph: entities, relations, BFS, and persistence.
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";

async function runTests() {
  console.log("🧪 Ontology Tests\n");

  const { Ontology } = await import("../ontology.js");

  const testFile = join("/tmp", `ontology-test-${Date.now()}.jsonl`);

  try {
    const ontology = new Ontology(testFile);

    // Test 1: Add entities
    console.log("  ✅ Test: Add entities");
    const agent1 = ontology.addEntity("Agent", "SEO Specialist", { division: "marketing" });
    assert.equal(agent1.type, "Agent");
    assert.equal(agent1.name, "SEO Specialist");

    const agent2 = ontology.addEntity("Agent", "Backend Architect", { division: "engineering" });
    const project = ontology.addEntity("Project", "PhiClaw", { status: "active" });
    const division = ontology.addEntity("Division", "Engineering", { agentCount: 23 });

    // Test 2: Get entity
    console.log("  ✅ Test: Get entity");
    const retrieved = ontology.getEntity(agent1.id);
    assert(retrieved !== null);
    assert.equal(retrieved!.name, "SEO Specialist");

    // Test 3: Update entity
    console.log("  ✅ Test: Update entity");
    ontology.updateEntity(agent1.id, { successRate: 0.95 });
    const updated = ontology.getEntity(agent1.id);
    assert.equal(updated!.properties.successRate, 0.95);

    // Test 4: Add relations
    console.log("  ✅ Test: Add relations");
    const rel1 = ontology.addRelation(agent2.id, division.id, "belongs_to");
    assert(rel1 !== null);
    assert.equal(rel1!.type, "belongs_to");

    const rel2 = ontology.addRelation(project.id, agent1.id, "uses");
    const rel3 = ontology.addRelation(project.id, agent2.id, "uses");

    // Test 5: Get relations
    console.log("  ✅ Test: Get relations");
    const projectRels = ontology.getRelations(project.id);
    assert.equal(projectRels.length, 2);

    // Test 6: Get related entities
    console.log("  ✅ Test: Get related entities");
    const projectRelated = ontology.getRelatedEntities(project.id);
    assert.equal(projectRelated.length, 2);
    const relatedNames = projectRelated.map((e) => e.name);
    assert(relatedNames.includes("SEO Specialist"));
    assert(relatedNames.includes("Backend Architect"));

    // Test 7: Get related entities by type
    console.log("  ✅ Test: Get related entities by relation type");
    const usesRelated = ontology.getRelatedEntities(project.id, "uses");
    assert.equal(usesRelated.length, 2);

    // Test 8: BFS path finding
    console.log("  ✅ Test: BFS path finding");
    const path = ontology.findPath(agent1.id, division.id);
    // agent1 → project → agent2 → division
    assert(path !== null, "Should find a path");
    assert(path!.length >= 2, `Path should have 2+ entities, got ${path!.length}`);

    // Test 9: Find entities by type
    console.log("  ✅ Test: Find entities by type");
    const agents = ontology.findEntitiesByType("Agent");
    assert.equal(agents.length, 2);

    // Test 10: Search entities
    console.log("  ✅ Test: Search entities");
    const searchResults = ontology.searchEntities("SEO");
    assert(searchResults.length >= 1);
    assert.equal(searchResults[0].name, "SEO Specialist");

    // Test 11: Get subgraph
    console.log("  ✅ Test: Get subgraph");
    const subgraph = ontology.getSubgraph(project.id, 2);
    assert(subgraph.entities.length >= 3, "Subgraph should have 3+ entities");
    assert(subgraph.relations.length >= 2, "Subgraph should have 2+ relations");

    // Test 12: Stats
    console.log("  ✅ Test: Stats");
    const stats = ontology.getStats();
    assert.equal(stats.entityCount, 4);
    assert.equal(stats.relationCount, 3);
    assert.equal(stats.entityTypes.Agent, 2);

    // Test 13: Delete relation
    console.log("  ✅ Test: Delete relation");
    ontology.deleteRelation(rel1!.id);
    const afterDelRels = ontology.getRelations(agent2.id);
    assert(
      !afterDelRels.some((r) => r.id === rel1!.id),
      "Deleted relation should be gone",
    );

    // Test 14: Delete entity
    console.log("  ✅ Test: Delete entity");
    ontology.deleteEntity(agent1.id);
    assert.equal(ontology.getEntity(agent1.id), null);
    const statsAfterDel = ontology.getStats();
    assert.equal(statsAfterDel.entityCount, 3);

    // Test 15: Persistence — load from file
    console.log("  ✅ Test: Persistence");
    assert(existsSync(testFile), "JSONL file should exist");
    const ontology2 = new Ontology(testFile);
    ontology2.load();
    const reloaded = ontology2.getEntity(project.id);
    assert(reloaded !== null, "Project should persist");
    assert.equal(reloaded!.name, "PhiClaw");

    // Test 16: Compact
    console.log("  ✅ Test: Compact");
    ontology2.compact();
    const ontology3 = new Ontology(testFile);
    ontology3.load();
    assert.equal(ontology3.getStats().entityCount, 3, "Compacted file should have 3 entities");

    // Test 17: Duplicate entity returns existing
    console.log("  ✅ Test: Duplicate entity returns existing");
    const dup = ontology3.addEntity("Project", "PhiClaw", { newProp: "value" });
    assert.equal(dup.id, project.id);
    assert.equal(dup.properties.newProp, "value");

    console.log(`\n✅ All ${17} tests passed!\n`);
  } finally {
    // Cleanup
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  }
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
