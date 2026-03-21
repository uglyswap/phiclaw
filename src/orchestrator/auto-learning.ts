/**
 * PhiClaw — Auto-Learning Module
 *
 * Captures errors, corrections, successes, and patterns from orchestrations
 * to continuously improve future performance.
 *
 * Learning sources:
 *  1. Task failures — records what went wrong and why
 *  2. User feedback — captures corrections and preferences
 *  3. Agent performance — tracks success rates and timing
 *  4. Pattern recognition — identifies recurring task types and optimal agents
 *
 * Learnings are stored in the MemoryStore and can be queried
 * to inform future orchestration decisions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { OrchestrationResult, TaskResult } from "./types.js";

// ─── Types ─────────────────────────────────────────────────

export interface Learning {
  id: string;
  timestamp: string;
  category: LearningCategory;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  context: LearningContext;
  resolution?: string;
  tags: string[];
}

export type LearningCategory =
  | "agent-routing"
  | "task-failure"
  | "task-success-pattern"
  | "user-correction"
  | "performance"
  | "prompt-quality"
  | "general";

export interface LearningContext {
  orchestrationId?: string;
  objective?: string;
  taskId?: string;
  agentIds?: string[];
  errorMessage?: string;
  durationMs?: number;
}

export interface AgentRecommendation {
  agentId: string;
  score: number;
  reason: string;
  basedOnLearnings: string[];
}

// ─── Auto-Learning Config ──────────────────────────────────

export interface AutoLearningConfig {
  /** Whether auto-learning is enabled */
  enabled: boolean;
  /** Directory for storing learnings */
  storageDir: string;
  /** Maximum learnings to retain */
  maxLearnings: number;
  /** Auto-learn from task failures */
  learnFromFailures: boolean;
  /** Auto-learn from task successes */
  learnFromSuccesses: boolean;
  /** Track agent performance patterns */
  trackPerformance: boolean;
}

export const DEFAULT_AUTO_LEARNING_CONFIG: AutoLearningConfig = {
  enabled: true,
  storageDir: ".phiclaw/learnings",
  maxLearnings: 500,
  learnFromFailures: true,
  learnFromSuccesses: true,
  trackPerformance: true,
};

// ─── Auto-Learning Engine ──────────────────────────────────

export class AutoLearningEngine {
  private learnings: Learning[] = [];
  private agentSuccessRates: Map<string, { success: number; total: number }> = new Map();
  private taskPatterns: Map<string, string[]> = new Map(); // keyword pattern → best agent ids
  private config: AutoLearningConfig;
  private loaded = false;

  constructor(config?: Partial<AutoLearningConfig>) {
    this.config = { ...DEFAULT_AUTO_LEARNING_CONFIG, ...config };
  }

  /**
   * Initialize the learning engine, loading existing data.
   */
  initialize(): void {
    if (this.loaded) return;
    this.loadFromDisk();
    this.loaded = true;
  }

  /**
   * Process the results of an orchestration and extract learnings.
   */
  processOrchestrationResult(result: OrchestrationResult): Learning[] {
    if (!this.config.enabled) return [];
    this.initialize();

    const newLearnings: Learning[] = [];

    for (const taskResult of result.taskResults) {
      if (taskResult.status === "failed" && this.config.learnFromFailures) {
        const learning = this.learnFromFailure(taskResult, result);
        if (learning) newLearnings.push(learning);
      }

      if (taskResult.status === "completed" && this.config.learnFromSuccesses) {
        const learning = this.learnFromSuccess(taskResult, result);
        if (learning) newLearnings.push(learning);
      }

      if (this.config.trackPerformance) {
        this.updateAgentPerformance(taskResult);
      }
    }

    // Detect patterns across multiple orchestrations
    const patternLearnings = this.detectPatterns(result);
    newLearnings.push(...patternLearnings);

    // Trim if over max
    if (this.learnings.length > this.config.maxLearnings) {
      this.learnings = this.learnings.slice(-this.config.maxLearnings);
    }

    this.saveToDisk();
    return newLearnings;
  }

  /**
   * Record a user correction as a learning.
   */
  recordUserCorrection(
    correction: string,
    context: { orchestrationId?: string; taskId?: string; agentIds?: string[] },
  ): Learning {
    this.initialize();

    const learning: Learning = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: "user-correction",
      severity: "warning",
      title: "User Correction",
      description: correction,
      context: {
        orchestrationId: context.orchestrationId,
        taskId: context.taskId,
        agentIds: context.agentIds,
      },
      tags: ["user-feedback", "correction"],
    };

    this.learnings.push(learning);
    this.saveToDisk();
    return learning;
  }

  /**
   * Get recommendations for which agents to use for a given task description.
   * Based on historical performance data.
   */
  getAgentRecommendations(taskDescription: string): AgentRecommendation[] {
    this.initialize();

    const recommendations: AgentRecommendation[] = [];
    const keywords = taskDescription.toLowerCase().split(/\s+/);

    // Check task patterns
    for (const [pattern, agentIds] of this.taskPatterns.entries()) {
      const patternWords = pattern.split(/\s+/);
      const overlap = keywords.filter((k) => patternWords.includes(k)).length;
      if (overlap > 0) {
        for (const agentId of agentIds) {
          const perf = this.agentSuccessRates.get(agentId);
          const successRate = perf ? perf.success / perf.total : 0.5;

          recommendations.push({
            agentId,
            score: overlap * successRate,
            reason: `Matched pattern "${pattern}" with ${Math.round(successRate * 100)}% success rate`,
            basedOnLearnings: this.learnings
              .filter(
                (l) =>
                  l.context.agentIds?.includes(agentId) &&
                  l.category === "task-success-pattern",
              )
              .map((l) => l.id),
          });
        }
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    // Deduplicate
    const seen = new Set<string>();
    return recommendations.filter((r) => {
      if (seen.has(r.agentId)) return false;
      seen.add(r.agentId);
      return true;
    });
  }

  /**
   * Get all learnings, optionally filtered by category.
   */
  getLearnings(category?: LearningCategory): Learning[] {
    this.initialize();
    if (category) {
      return this.learnings.filter((l) => l.category === category);
    }
    return [...this.learnings];
  }

  /**
   * Search learnings by text.
   */
  searchLearnings(query: string): Learning[] {
    this.initialize();
    const lower = query.toLowerCase();
    return this.learnings.filter(
      (l) =>
        l.title.toLowerCase().includes(lower) ||
        l.description.toLowerCase().includes(lower) ||
        l.tags.some((t) => t.includes(lower)),
    );
  }

  /**
   * Get statistics.
   */
  getStats(): {
    totalLearnings: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    agentPerformance: Array<{ agentId: string; successRate: number; totalTasks: number }>;
  } {
    this.initialize();

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const learning of this.learnings) {
      byCategory[learning.category] = (byCategory[learning.category] ?? 0) + 1;
      bySeverity[learning.severity] = (bySeverity[learning.severity] ?? 0) + 1;
    }

    const agentPerformance = [...this.agentSuccessRates.entries()]
      .map(([agentId, stats]) => ({
        agentId,
        successRate: stats.total > 0 ? stats.success / stats.total : 0,
        totalTasks: stats.total,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    return {
      totalLearnings: this.learnings.length,
      byCategory,
      bySeverity,
      agentPerformance,
    };
  }

  /**
   * Format learnings as a readable summary.
   */
  formatSummary(): string {
    this.initialize();

    if (this.learnings.length === 0) {
      return "📚 No learnings recorded yet.";
    }

    const stats = this.getStats();
    const lines: string[] = [
      `## 📚 Auto-Learning Summary`,
      ``,
      `**Total Learnings:** ${stats.totalLearnings}`,
      ``,
    ];

    // Recent learnings
    const recent = this.learnings.slice(-5);
    lines.push(`### Recent Learnings`);
    for (const l of recent) {
      const icon = { info: "ℹ️", warning: "⚠️", critical: "🚨" }[l.severity];
      lines.push(`${icon} **${l.title}** (${l.category})`);
      lines.push(`   ${l.description.slice(0, 100)}`);
    }

    // Agent performance
    if (stats.agentPerformance.length > 0) {
      lines.push(`\n### Agent Performance`);
      for (const perf of stats.agentPerformance.slice(0, 10)) {
        const rate = Math.round(perf.successRate * 100);
        lines.push(`  ${rate >= 80 ? "✅" : rate >= 50 ? "⚠️" : "❌"} ${perf.agentId}: ${rate}% success (${perf.totalTasks} tasks)`);
      }
    }

    return lines.join("\n");
  }

  // ─── Private Methods ──────────────────────────────────────

  private learnFromFailure(taskResult: TaskResult, orchResult: OrchestrationResult): Learning {
    const learning: Learning = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: "task-failure",
      severity: "warning",
      title: `Task Failed: ${taskResult.taskDescription.slice(0, 60)}`,
      description: `Task "${taskResult.taskDescription}" failed with error: ${taskResult.error ?? "unknown"}. Agents: ${taskResult.agentNames.join(", ") || "none assigned"}.`,
      context: {
        orchestrationId: orchResult.plan.id,
        objective: orchResult.plan.objective,
        taskId: taskResult.taskId,
        agentIds: taskResult.agentNames.map((n) => n.toLowerCase().replace(/\s+/g, "-")),
        errorMessage: taskResult.error,
        durationMs: taskResult.durationMs,
      },
      tags: ["failure", ...taskResult.agentNames.map((n) => n.toLowerCase())],
    };

    this.learnings.push(learning);
    return learning;
  }

  private learnFromSuccess(taskResult: TaskResult, orchResult: OrchestrationResult): Learning | null {
    // Only learn from successes that might be reusable patterns
    if (taskResult.agentNames.length === 0) return null;

    const learning: Learning = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: "task-success-pattern",
      severity: "info",
      title: `Success: ${taskResult.taskDescription.slice(0, 60)}`,
      description: `Task "${taskResult.taskDescription}" completed successfully by ${taskResult.agentNames.join(", ")} in ${taskResult.durationMs}ms.`,
      context: {
        orchestrationId: orchResult.plan.id,
        objective: orchResult.plan.objective,
        taskId: taskResult.taskId,
        agentIds: taskResult.agentNames.map((n) => n.toLowerCase().replace(/\s+/g, "-")),
        durationMs: taskResult.durationMs,
      },
      tags: ["success", ...taskResult.agentNames.map((n) => n.toLowerCase())],
    };

    // Update task patterns
    const keyWords = taskResult.taskDescription.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
      .join(" ");

    if (keyWords) {
      const existing = this.taskPatterns.get(keyWords) ?? [];
      for (const agentName of taskResult.agentNames) {
        const agentId = agentName.toLowerCase().replace(/\s+/g, "-");
        if (!existing.includes(agentId)) {
          existing.push(agentId);
        }
      }
      this.taskPatterns.set(keyWords, existing);
    }

    this.learnings.push(learning);
    return learning;
  }

  private updateAgentPerformance(taskResult: TaskResult): void {
    for (const agentName of taskResult.agentNames) {
      const agentId = agentName.toLowerCase().replace(/\s+/g, "-");
      const current = this.agentSuccessRates.get(agentId) ?? { success: 0, total: 0 };
      current.total++;
      if (taskResult.status === "completed") current.success++;
      this.agentSuccessRates.set(agentId, current);
    }
  }

  private detectPatterns(result: OrchestrationResult): Learning[] {
    const patterns: Learning[] = [];

    // Check if overall success rate is declining
    const recentResults = this.learnings
      .filter((l) => l.category === "task-failure")
      .slice(-10);

    if (recentResults.length >= 5) {
      const recentFailRate = recentResults.length / 10;
      if (recentFailRate > 0.5) {
        patterns.push({
          id: this.generateId(),
          timestamp: new Date().toISOString(),
          category: "performance",
          severity: "critical",
          title: "High failure rate detected",
          description: `${Math.round(recentFailRate * 100)}% of recent tasks have failed. Review agent assignments and task decomposition.`,
          context: { orchestrationId: result.plan.id },
          tags: ["pattern", "performance-degradation"],
        });
      }
    }

    return patterns;
  }

  private generateId(): string {
    return `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // ─── Persistence ──────────────────────────────────────────

  private loadFromDisk(): void {
    try {
      const filePath = join(this.config.storageDir, "learnings.json");
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, "utf-8"));
        this.learnings = data.learnings ?? [];

        // Reconstruct agent success rates
        if (data.agentSuccessRates) {
          this.agentSuccessRates = new Map(Object.entries(data.agentSuccessRates));
        }

        // Reconstruct task patterns
        if (data.taskPatterns) {
          this.taskPatterns = new Map(Object.entries(data.taskPatterns));
        }
      }
    } catch {
      // Start fresh
    }
  }

  private saveToDisk(): void {
    try {
      mkdirSync(this.config.storageDir, { recursive: true });

      const data = {
        learnings: this.learnings,
        agentSuccessRates: Object.fromEntries(this.agentSuccessRates),
        taskPatterns: Object.fromEntries(this.taskPatterns),
        savedAt: new Date().toISOString(),
      };

      writeFileSync(
        join(this.config.storageDir, "learnings.json"),
        JSON.stringify(data, null, 2),
      );
    } catch {
      // Silently fail
    }
  }
}
