/**
 * PhiClaw Orchestrator — Compiler
 *
 * The Compiler takes the results of all executed tasks and synthesizes them
 * into a unified, structured deliverable. It also generates an execution
 * summary with metrics and status.
 *
 * Two compilation modes:
 *  1. Simple: concatenate task results with headers (fast, no LLM)
 *  2. Intelligent: use an LLM to synthesize results into a cohesive document
 */

import type { AgentLoader } from "./agent-loader.js";
import type {
  OrchestrationPlan,
  OrchestrationResult,
  TaskResult,
} from "./types.js";
import type { LLMCaller } from "./executor.js";

// ─── Compilation Prompt ────────────────────────────────────

const COMPILATION_PROMPT = `You are PhiClaw's result compiler. You have the outputs from multiple specialized agents who each worked on part of a larger objective.

Your job is to synthesize their individual outputs into a single, cohesive deliverable.

RULES:
- Preserve all substantive content from each agent's output
- Remove redundancy and contradictions (prefer the more specific/expert opinion)
- Structure the result with clear headers and sections
- Add a brief executive summary at the top
- Maintain a professional, actionable tone
- Do not add information that wasn't in the original outputs
- Credit which agent/division contributed each section

ORIGINAL OBJECTIVE:
{OBJECTIVE}

AGENT OUTPUTS:
{OUTPUTS}

Compile these into a single, well-structured document.`;

// ─── Compiler Class ────────────────────────────────────────

export class Compiler {
  private agentLoader: AgentLoader;
  private llmCaller: LLMCaller | null;

  constructor(agentLoader: AgentLoader, llmCaller?: LLMCaller) {
    this.agentLoader = agentLoader;
    this.llmCaller = llmCaller ?? null;
  }

  /**
   * Compile task results into an OrchestrationResult.
   *
   * @param plan The executed plan
   * @param taskResults Results from the executor
   * @param useIntelligentCompilation Whether to use LLM for synthesis
   */
  async compile(
    plan: OrchestrationPlan,
    taskResults: TaskResult[],
    useIntelligentCompilation: boolean = false,
  ): Promise<OrchestrationResult> {
    const totalDurationMs = taskResults.reduce((sum, r) => sum + r.durationMs, 0);
    const completedCount = taskResults.filter((r) => r.status === "completed").length;
    const failedCount = taskResults.filter((r) => r.status === "failed").length;

    // Determine overall status
    let status: "completed" | "partial" | "failed";
    if (failedCount === 0) {
      status = "completed";
    } else if (completedCount > 0) {
      status = "partial";
    } else {
      status = "failed";
    }

    // Generate deliverable
    let deliverable: string;
    if (useIntelligentCompilation && this.llmCaller && completedCount > 0) {
      deliverable = await this.intelligentCompile(plan.objective, taskResults);
    } else {
      deliverable = this.simpleCompile(plan.objective, taskResults);
    }

    // Generate summary
    const summary = this.generateSummary(plan, taskResults, totalDurationMs);

    return {
      plan,
      status,
      deliverable,
      summary,
      totalDurationMs,
      taskResults,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Simple compilation: structured concatenation of results.
   */
  private simpleCompile(objective: string, results: TaskResult[]): string {
    const sections: string[] = [
      `# 📦 PhiClaw Orchestration Result`,
      ``,
      `**Objective:** ${objective}`,
      `**Completed:** ${results.filter((r) => r.status === "completed").length}/${results.length} tasks`,
      ``,
      `---`,
      ``,
    ];

    for (const result of results) {
      const statusIcon = result.status === "completed" ? "✅" : "❌";
      const agents = result.agentNames.length > 0
        ? ` (by ${result.agentNames.join(", ")})`
        : "";

      sections.push(`## ${statusIcon} ${result.taskDescription}${agents}`);
      sections.push(``);

      if (result.status === "completed" && result.result) {
        sections.push(result.result);
      } else if (result.error) {
        sections.push(`> ⚠️ **Error:** ${result.error}`);
      }

      sections.push(``);
      sections.push(`---`);
      sections.push(``);
    }

    return sections.join("\n");
  }

  /**
   * Intelligent compilation: use LLM to synthesize results.
   */
  private async intelligentCompile(
    objective: string,
    results: TaskResult[],
  ): Promise<string> {
    const completedResults = results.filter((r) => r.status === "completed" && r.result);

    if (completedResults.length === 0) {
      return this.simpleCompile(objective, results);
    }

    const outputs = completedResults
      .map((r) => {
        const agents = r.agentNames.join(", ") || "General";
        return `### ${r.taskDescription} (by ${agents})\n${r.result}`;
      })
      .join("\n\n---\n\n");

    const prompt = COMPILATION_PROMPT
      .replace("{OBJECTIVE}", objective)
      .replace("{OUTPUTS}", outputs);

    try {
      const compiled = await this.llmCaller!.call(
        "You are a professional document compiler and editor.",
        prompt,
      );
      return compiled;
    } catch {
      // Fallback to simple compilation if LLM fails
      return this.simpleCompile(objective, results);
    }
  }

  /**
   * Generate an execution summary with metrics.
   */
  private generateSummary(
    plan: OrchestrationPlan,
    results: TaskResult[],
    totalDurationMs: number,
  ): string {
    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const totalTasks = results.length;

    const agentSet = new Set<string>();
    for (const r of results) {
      for (const name of r.agentNames) {
        agentSet.add(name);
      }
    }

    const durationSec = Math.round(totalDurationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const lines: string[] = [
      `## 📊 Execution Summary`,
      ``,
      `| Metric | Value |`,
      `|---|---|`,
      `| Objective | ${plan.objective} |`,
      `| Tasks | ${completed}/${totalTasks} completed${failed > 0 ? ` (${failed} failed)` : ""} |`,
      `| Agents Used | ${agentSet.size} (${[...agentSet].join(", ")}) |`,
      `| Execution Mode | ${plan.executionMode} |`,
      `| Duration | ${durationStr} |`,
      `| Plan ID | ${plan.id} |`,
    ];

    if (failed > 0) {
      lines.push(``);
      lines.push(`### ❌ Failed Tasks`);
      for (const r of results.filter((r) => r.status === "failed")) {
        lines.push(`- **${r.taskDescription}**: ${r.error ?? "Unknown error"}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format an OrchestrationResult for display in chat.
   */
  formatForChat(result: OrchestrationResult): string {
    const statusEmoji = {
      completed: "✅",
      partial: "⚠️",
      failed: "❌",
    }[result.status];

    const header = `${statusEmoji} **Orchestration ${result.status}**\n\n`;

    // For chat, keep it concise — summary + deliverable preview
    const preview = result.deliverable.length > 2000
      ? result.deliverable.slice(0, 2000) + "\n\n_[...truncated — full result available]_"
      : result.deliverable;

    return header + result.summary + "\n\n---\n\n" + preview;
  }
}
