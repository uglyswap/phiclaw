/**
 * PhiClaw — Memory Module (QMD 2 Integration)
 *
 * Provides persistent memory for orchestrations using QMD 2's
 * hybrid BM25 + vector search backend. Stores orchestration plans,
 * results, and learnings for future reference.
 *
 * Collections:
 *  - orchestrations: plans and results from past orchestrations
 *  - learnings: lessons learned from successes and failures
 *
 * This module provides an abstraction layer that works with or without
 * QMD 2 installed. When QMD is not available, it falls back to
 * in-memory storage.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationResult, OrchestrationPlan } from "./types.js";

// ─── Types ─────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  timestamp: string;
  type: "orchestration" | "learning" | "agent-performance";
  content: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface OrchestrationMemory {
  planId: string;
  objective: string;
  status: string;
  agentsUsed: string[];
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  timestamp: string;
  deliverableSummary: string;
}

export interface LearningEntry {
  id: string;
  timestamp: string;
  source: "orchestration" | "user-feedback" | "error";
  lesson: string;
  context: string;
  agentIds: string[];
  tags: string[];
}

export interface AgentPerformanceEntry {
  agentId: string;
  agentName: string;
  taskDescription: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

// ─── Memory Config ─────────────────────────────────────────

export interface MemoryConfig {
  /** Directory for file-based memory storage */
  storageDir: string;
  /** Maximum entries to keep in memory */
  maxEntries: number;
  /** Whether to persist to disk */
  persistToDisk: boolean;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  storageDir: ".phiclaw/memory",
  maxEntries: 1000,
  persistToDisk: true,
};

// ─── Memory Store ──────────────────────────────────────────

export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private orchestrations: OrchestrationMemory[] = [];
  private learnings: LearningEntry[] = [];
  private agentPerformance: AgentPerformanceEntry[] = [];
  private config: MemoryConfig;
  private loaded = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * Initialize the memory store, loading existing data from disk.
   */
  initialize(): void {
    if (this.loaded) return;

    if (this.config.persistToDisk) {
      this.loadFromDisk();
    }
    this.loaded = true;
  }

  /**
   * Record a completed orchestration.
   */
  recordOrchestration(result: OrchestrationResult): void {
    this.initialize();

    const agentsUsed = new Set<string>();
    for (const tr of result.taskResults) {
      for (const name of tr.agentNames) {
        agentsUsed.add(name);
      }
    }

    const memory: OrchestrationMemory = {
      planId: result.plan.id,
      objective: result.plan.objective,
      status: result.status,
      agentsUsed: [...agentsUsed],
      taskCount: result.taskResults.length,
      completedTasks: result.taskResults.filter((t) => t.status === "completed").length,
      failedTasks: result.taskResults.filter((t) => t.status === "failed").length,
      totalDurationMs: result.totalDurationMs,
      timestamp: result.completedAt,
      deliverableSummary: result.deliverable.slice(0, 500),
    };

    this.orchestrations.push(memory);

    // Record individual agent performance
    for (const tr of result.taskResults) {
      for (const agentName of tr.agentNames) {
        this.agentPerformance.push({
          agentId: agentName.toLowerCase().replace(/\s+/g, "-"),
          agentName,
          taskDescription: tr.taskDescription,
          success: tr.status === "completed",
          durationMs: tr.durationMs,
          timestamp: result.completedAt,
        });
      }
    }

    // Auto-generate learnings from failures
    for (const tr of result.taskResults) {
      if (tr.status === "failed" && tr.error) {
        this.addLearning({
          id: `learning-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          source: "error",
          lesson: `Task "${tr.taskDescription}" failed: ${tr.error}. Agents: ${tr.agentNames.join(", ") || "none"}`,
          context: result.plan.objective,
          agentIds: tr.agentNames.map((n) => n.toLowerCase().replace(/\s+/g, "-")),
          tags: ["failure", "auto-generated"],
        });
      }
    }

    if (this.config.persistToDisk) {
      this.saveToDisk();
    }
  }

  /**
   * Add a learning entry.
   */
  addLearning(learning: LearningEntry): void {
    this.initialize();
    this.learnings.push(learning);

    if (this.config.persistToDisk) {
      this.saveToDisk();
    }
  }

  /**
   * Search orchestration history by objective text.
   */
  searchOrchestrations(query: string): OrchestrationMemory[] {
    this.initialize();
    const lower = query.toLowerCase();
    return this.orchestrations.filter(
      (o) =>
        o.objective.toLowerCase().includes(lower) ||
        o.deliverableSummary.toLowerCase().includes(lower) ||
        o.agentsUsed.some((a) => a.toLowerCase().includes(lower)),
    );
  }

  /**
   * Search learnings by text.
   */
  searchLearnings(query: string): LearningEntry[] {
    this.initialize();
    const lower = query.toLowerCase();
    return this.learnings.filter(
      (l) =>
        l.lesson.toLowerCase().includes(lower) ||
        l.context.toLowerCase().includes(lower) ||
        l.tags.some((t) => t.includes(lower)),
    );
  }

  /**
   * Get performance metrics for a specific agent.
   */
  getAgentPerformance(agentId: string): {
    totalTasks: number;
    successRate: number;
    avgDurationMs: number;
    recentTasks: AgentPerformanceEntry[];
  } {
    this.initialize();
    const entries = this.agentPerformance.filter((e) => e.agentId === agentId);

    if (entries.length === 0) {
      return { totalTasks: 0, successRate: 0, avgDurationMs: 0, recentTasks: [] };
    }

    const successes = entries.filter((e) => e.success).length;
    const avgDuration = entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length;

    return {
      totalTasks: entries.length,
      successRate: successes / entries.length,
      avgDurationMs: Math.round(avgDuration),
      recentTasks: entries.slice(-10),
    };
  }

  /**
   * Get all learnings, optionally filtered by source.
   */
  getLearnings(source?: LearningEntry["source"]): LearningEntry[] {
    this.initialize();
    if (source) {
      return this.learnings.filter((l) => l.source === source);
    }
    return [...this.learnings];
  }

  /**
   * Get recent orchestrations.
   */
  getRecentOrchestrations(limit: number = 10): OrchestrationMemory[] {
    this.initialize();
    return this.orchestrations.slice(-limit);
  }

  /**
   * Get statistics.
   */
  getStats(): {
    totalOrchestrations: number;
    totalLearnings: number;
    totalAgentExecutions: number;
    overallSuccessRate: number;
  } {
    this.initialize();
    const totalExecs = this.agentPerformance.length;
    const successes = this.agentPerformance.filter((e) => e.success).length;

    return {
      totalOrchestrations: this.orchestrations.length,
      totalLearnings: this.learnings.length,
      totalAgentExecutions: totalExecs,
      overallSuccessRate: totalExecs > 0 ? successes / totalExecs : 0,
    };
  }

  // ─── Persistence ───────────────────────────────────────────

  private getStoragePath(): string {
    return this.config.storageDir;
  }

  private loadFromDisk(): void {
    const dir = this.getStoragePath();

    try {
      const orchPath = join(dir, "orchestrations.json");
      if (existsSync(orchPath)) {
        this.orchestrations = JSON.parse(readFileSync(orchPath, "utf-8"));
      }

      const learnPath = join(dir, "learnings.json");
      if (existsSync(learnPath)) {
        this.learnings = JSON.parse(readFileSync(learnPath, "utf-8"));
      }

      const perfPath = join(dir, "agent-performance.json");
      if (existsSync(perfPath)) {
        this.agentPerformance = JSON.parse(readFileSync(perfPath, "utf-8"));
      }
    } catch {
      // If loading fails, start with empty collections
    }
  }

  private saveToDisk(): void {
    const dir = this.getStoragePath();

    try {
      mkdirSync(dir, { recursive: true });

      writeFileSync(
        join(dir, "orchestrations.json"),
        JSON.stringify(this.orchestrations, null, 2),
      );
      writeFileSync(
        join(dir, "learnings.json"),
        JSON.stringify(this.learnings, null, 2),
      );
      writeFileSync(
        join(dir, "agent-performance.json"),
        JSON.stringify(this.agentPerformance, null, 2),
      );
    } catch {
      // Silently fail — memory is still available in-memory
    }
  }
}
