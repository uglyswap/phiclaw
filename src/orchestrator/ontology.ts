/**
 * PhiClaw — Ontology Module (Knowledge Graph)
 *
 * Provides a typed knowledge graph for structured agent memory.
 * Uses an append-only JSONL file for persistence and supports
 * BFS traversal for relationship discovery.
 *
 * Entity types: Agent, Division, Task, Orchestration, Skill, Project
 * Relation types: belongs_to, depends_on, executed_by, produced, learned_from
 *
 * This is integrated natively into PhiClaw (not as an external skill).
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── Entity Types ──────────────────────────────────────────

export type EntityType =
  | "Agent"
  | "Division"
  | "Task"
  | "Orchestration"
  | "Skill"
  | "Project"
  | "Learning"
  | "Custom";

export type RelationType =
  | "belongs_to"
  | "depends_on"
  | "executed_by"
  | "produced"
  | "learned_from"
  | "related_to"
  | "part_of"
  | "uses"
  | "created_by";

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  properties: Record<string, unknown>;
  createdAt: string;
}

// ─── JSONL Operations ──────────────────────────────────────

type JournalOp =
  | { op: "add_entity"; entity: Entity }
  | { op: "update_entity"; id: string; properties: Record<string, unknown>; updatedAt: string }
  | { op: "delete_entity"; id: string }
  | { op: "add_relation"; relation: Relation }
  | { op: "delete_relation"; id: string };

// ─── Ontology Class ────────────────────────────────────────

export class Ontology {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private adjacency: Map<string, Set<string>> = new Map(); // entity id → set of relation ids
  private filePath: string;
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Load the ontology from the JSONL file.
   */
  load(): void {
    if (this.loaded) return;

    if (existsSync(this.filePath)) {
      const content = readFileSync(this.filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const op = JSON.parse(line) as JournalOp;
          this.applyOp(op);
        } catch {
          // Skip malformed lines
        }
      }
    }

    this.loaded = true;
  }

  /**
   * Apply a journal operation to the in-memory state.
   */
  private applyOp(op: JournalOp): void {
    switch (op.op) {
      case "add_entity":
        this.entities.set(op.entity.id, op.entity);
        if (!this.adjacency.has(op.entity.id)) {
          this.adjacency.set(op.entity.id, new Set());
        }
        break;

      case "update_entity": {
        const entity = this.entities.get(op.id);
        if (entity) {
          entity.properties = { ...entity.properties, ...op.properties };
          entity.updatedAt = op.updatedAt;
        }
        break;
      }

      case "delete_entity":
        this.entities.delete(op.id);
        // Remove all relations involving this entity
        const relIds = this.adjacency.get(op.id);
        if (relIds) {
          for (const relId of relIds) {
            const rel = this.relations.get(relId);
            if (rel) {
              // Remove from the other entity's adjacency
              const otherId = rel.sourceId === op.id ? rel.targetId : rel.sourceId;
              this.adjacency.get(otherId)?.delete(relId);
            }
            this.relations.delete(relId);
          }
        }
        this.adjacency.delete(op.id);
        break;

      case "add_relation":
        this.relations.set(op.relation.id, op.relation);
        if (!this.adjacency.has(op.relation.sourceId)) {
          this.adjacency.set(op.relation.sourceId, new Set());
        }
        if (!this.adjacency.has(op.relation.targetId)) {
          this.adjacency.set(op.relation.targetId, new Set());
        }
        this.adjacency.get(op.relation.sourceId)!.add(op.relation.id);
        this.adjacency.get(op.relation.targetId)!.add(op.relation.id);
        break;

      case "delete_relation": {
        const relation = this.relations.get(op.id);
        if (relation) {
          this.adjacency.get(relation.sourceId)?.delete(op.id);
          this.adjacency.get(relation.targetId)?.delete(op.id);
          this.relations.delete(op.id);
        }
        break;
      }
    }
  }

  /**
   * Append an operation to the JSONL file and apply it.
   */
  private appendOp(op: JournalOp): void {
    this.applyOp(op);

    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    appendFileSync(this.filePath, JSON.stringify(op) + "\n");
  }

  // ─── Entity CRUD ───────────────────────────────────────────

  /**
   * Add a new entity to the ontology.
   */
  addEntity(type: EntityType, name: string, properties: Record<string, unknown> = {}): Entity {
    this.load();

    const id = `${type.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;

    // If entity already exists, update it
    if (this.entities.has(id)) {
      this.updateEntity(id, properties);
      return this.entities.get(id)!;
    }

    const entity: Entity = {
      id,
      type,
      name,
      properties,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.appendOp({ op: "add_entity", entity });
    return entity;
  }

  /**
   * Get an entity by ID.
   */
  getEntity(id: string): Entity | null {
    this.load();
    return this.entities.get(id) ?? null;
  }

  /**
   * Update an entity's properties.
   */
  updateEntity(id: string, properties: Record<string, unknown>): void {
    this.load();
    if (!this.entities.has(id)) return;

    this.appendOp({
      op: "update_entity",
      id,
      properties,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Delete an entity and all its relations.
   */
  deleteEntity(id: string): void {
    this.load();
    if (!this.entities.has(id)) return;
    this.appendOp({ op: "delete_entity", id });
  }

  /**
   * Find entities by type.
   */
  findEntitiesByType(type: EntityType): Entity[] {
    this.load();
    return [...this.entities.values()].filter((e) => e.type === type);
  }

  /**
   * Search entities by name or properties.
   */
  searchEntities(query: string): Entity[] {
    this.load();
    const lower = query.toLowerCase();
    return [...this.entities.values()].filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.id.includes(lower) ||
        JSON.stringify(e.properties).toLowerCase().includes(lower),
    );
  }

  // ─── Relation CRUD ─────────────────────────────────────────

  /**
   * Add a relation between two entities.
   */
  addRelation(
    sourceId: string,
    targetId: string,
    type: RelationType,
    properties: Record<string, unknown> = {},
  ): Relation | null {
    this.load();

    if (!this.entities.has(sourceId) || !this.entities.has(targetId)) {
      return null;
    }

    const id = `rel-${sourceId}-${type}-${targetId}`;

    // Prevent duplicates
    if (this.relations.has(id)) {
      return this.relations.get(id)!;
    }

    const relation: Relation = {
      id,
      sourceId,
      targetId,
      type,
      properties,
      createdAt: new Date().toISOString(),
    };

    this.appendOp({ op: "add_relation", relation });
    return relation;
  }

  /**
   * Get all relations for an entity.
   */
  getRelations(entityId: string): Relation[] {
    this.load();
    const relIds = this.adjacency.get(entityId);
    if (!relIds) return [];
    return [...relIds].map((id) => this.relations.get(id)!).filter(Boolean);
  }

  /**
   * Get related entities (neighbors in the graph).
   */
  getRelatedEntities(entityId: string, relationType?: RelationType): Entity[] {
    this.load();
    const relations = this.getRelations(entityId);
    const filtered = relationType
      ? relations.filter((r) => r.type === relationType)
      : relations;

    const neighborIds = new Set<string>();
    for (const rel of filtered) {
      if (rel.sourceId === entityId) neighborIds.add(rel.targetId);
      if (rel.targetId === entityId) neighborIds.add(rel.sourceId);
    }

    return [...neighborIds]
      .map((id) => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  /**
   * Delete a relation.
   */
  deleteRelation(id: string): void {
    this.load();
    if (!this.relations.has(id)) return;
    this.appendOp({ op: "delete_relation", id });
  }

  // ─── Graph Traversal ──────────────────────────────────────

  /**
   * BFS traversal to find paths between two entities.
   */
  findPath(startId: string, endId: string, maxDepth: number = 5): Entity[] | null {
    this.load();

    if (!this.entities.has(startId) || !this.entities.has(endId)) return null;
    if (startId === endId) return [this.entities.get(startId)!];

    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length > maxDepth) continue;

      const neighbors = this.getRelatedEntities(current.id);
      for (const neighbor of neighbors) {
        if (neighbor.id === endId) {
          const fullPath = [...current.path, neighbor.id];
          return fullPath.map((id) => this.entities.get(id)!).filter(Boolean);
        }

        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push({ id: neighbor.id, path: [...current.path, neighbor.id] });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get a subgraph around an entity (all entities within N hops).
   */
  getSubgraph(
    centerId: string,
    maxDepth: number = 2,
  ): { entities: Entity[]; relations: Relation[] } {
    this.load();

    const visitedEntities = new Set<string>();
    const visitedRelations = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: centerId, depth: 0 }];
    visitedEntities.add(centerId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) continue;

      const relIds = this.adjacency.get(current.id);
      if (!relIds) continue;

      for (const relId of relIds) {
        visitedRelations.add(relId);
        const rel = this.relations.get(relId);
        if (!rel) continue;

        const neighborId = rel.sourceId === current.id ? rel.targetId : rel.sourceId;
        if (!visitedEntities.has(neighborId)) {
          visitedEntities.add(neighborId);
          queue.push({ id: neighborId, depth: current.depth + 1 });
        }
      }
    }

    return {
      entities: [...visitedEntities].map((id) => this.entities.get(id)!).filter(Boolean),
      relations: [...visitedRelations].map((id) => this.relations.get(id)!).filter(Boolean),
    };
  }

  // ─── Statistics ────────────────────────────────────────────

  /**
   * Get ontology statistics.
   */
  getStats(): {
    entityCount: number;
    relationCount: number;
    entityTypes: Record<string, number>;
    relationTypes: Record<string, number>;
  } {
    this.load();

    const entityTypes: Record<string, number> = {};
    for (const entity of this.entities.values()) {
      entityTypes[entity.type] = (entityTypes[entity.type] ?? 0) + 1;
    }

    const relationTypes: Record<string, number> = {};
    for (const relation of this.relations.values()) {
      relationTypes[relation.type] = (relationTypes[relation.type] ?? 0) + 1;
    }

    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      entityTypes,
      relationTypes,
    };
  }

  /**
   * Compact the JSONL file (rewrite with only current state).
   */
  compact(): void {
    this.load();

    const ops: JournalOp[] = [];

    for (const entity of this.entities.values()) {
      ops.push({ op: "add_entity", entity });
    }
    for (const relation of this.relations.values()) {
      ops.push({ op: "add_relation", relation });
    }

    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, ops.map((op) => JSON.stringify(op)).join("\n") + "\n");
  }
}

// ─── Factory ───────────────────────────────────────────────

let defaultOntology: Ontology | null = null;

export function getDefaultOntology(storageDir?: string): Ontology {
  if (!defaultOntology) {
    const dir = storageDir ?? ".phiclaw";
    defaultOntology = new Ontology(join(dir, "ontology.jsonl"));
  }
  return defaultOntology;
}
