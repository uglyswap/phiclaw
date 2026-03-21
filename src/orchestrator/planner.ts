/**
 * PhiClaw Orchestrator — Planner
 *
 * The Planner decomposes a user's high-level objective into a structured
 * execution plan with ordered tasks, agent assignments, and dependency graphs.
 *
 * Strategy:
 *  1. Analyze the objective to extract intent, domain, and scope
 *  2. Break it into discrete, actionable tasks (max 10 by default)
 *  3. Assign the best-matching agent(s) to each task via the Router
 *  4. Determine task dependencies (what must complete before what)
 *  5. Choose execution mode (sequential, parallel, or mixed)
 */

import { randomUUID } from "node:crypto";
import type { AgentLoader, AgentMeta } from "./agent-loader.js";
import type { OrchestrationPlan, Task, ExecutionMode, OrchestratorConfig } from "./types.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./types.js";

// ─── Plan Schema for LLM ──────────────────────────────────

/**
 * JSON schema description sent to the LLM to structure its planning output.
 */
export const PLAN_GENERATION_PROMPT = `You are PhiClaw's orchestration planner. Your job is to decompose a user's objective into a structured execution plan.

You have access to specialized agents across these divisions:
{DIVISIONS_SUMMARY}

RULES:
- Maximum {MAX_TASKS} tasks per plan
- Each task must be concrete and actionable (not vague)
- Tasks should have clear deliverables
- Identify dependencies between tasks (what must complete before what)
- Assign 1-3 agents per task (prefer the most specialized match)
- Choose execution mode: "sequential" (ordered), "parallel" (independent), or "mixed" (some parallel groups)
- Estimate total duration realistically

OUTPUT FORMAT (strict JSON):
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Clear description of what to do",
      "assignedAgentIds": ["agent-id-1"],
      "dependencies": [],
      "prompt": "Detailed prompt for the agent to execute this task"
    }
  ],
  "executionMode": "sequential|parallel|mixed",
  "estimatedDuration": "X hours"
}

OBJECTIVE:
{OBJECTIVE}

Available agents (id → name, division):
{AGENTS_LIST}

Generate the plan as valid JSON. No markdown fences, no explanation — just the JSON.`;

// ─── LLM Plan Response Shape ───────────────────────────────

interface LLMPlanResponse {
  tasks: Array<{
    id: string;
    description: string;
    assignedAgentIds: string[];
    dependencies: string[];
    prompt: string;
  }>;
  executionMode: ExecutionMode;
  estimatedDuration: string;
}

// ─── Planner Class ─────────────────────────────────────────

export class Planner {
  private agentLoader: AgentLoader;
  private config: OrchestratorConfig;

  constructor(agentLoader: AgentLoader, config?: Partial<OrchestratorConfig>) {
    this.agentLoader = agentLoader;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  /**
   * Build the system prompt for plan generation, including available agents.
   */
  buildPlanningPrompt(objective: string): string {
    const divisions = this.agentLoader.listDivisions();
    const divSummary = divisions
      .map((d) => `- ${d.name} (${d.agentCount} agents)`)
      .join("\n");

    const agents = this.agentLoader.listAllAgents();
    const agentsList = agents
      .map((a) => `  ${a.id} → ${a.emoji} ${a.name} [${a.division}]: ${a.description.slice(0, 100)}`)
      .join("\n");

    return PLAN_GENERATION_PROMPT
      .replace("{DIVISIONS_SUMMARY}", divSummary)
      .replace("{MAX_TASKS}", String(this.config.maxTasksPerPlan))
      .replace("{OBJECTIVE}", objective)
      .replace("{AGENTS_LIST}", agentsList);
  }

  /**
   * Parse an LLM response into a validated OrchestrationPlan.
   * Handles common LLM output quirks (markdown fences, trailing commas, etc.).
   */
  parsePlanResponse(objective: string, llmOutput: string): OrchestrationPlan {
    // Strip markdown code fences if present
    let cleaned = llmOutput.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    // Remove trailing commas (common LLM mistake)
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

    let parsed: LLMPlanResponse;
    try {
      parsed = JSON.parse(cleaned) as LLMPlanResponse;
    } catch (err) {
      throw new Error(
        `Failed to parse plan JSON from LLM output: ${err instanceof Error ? err.message : String(err)}\n\nRaw output:\n${llmOutput.slice(0, 500)}`
      );
    }

    // Validate and transform
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error("Plan must contain at least one task");
    }

    if (parsed.tasks.length > this.config.maxTasksPerPlan) {
      parsed.tasks = parsed.tasks.slice(0, this.config.maxTasksPerPlan);
    }

    const validModes: ExecutionMode[] = ["sequential", "parallel", "mixed"];
    const executionMode = validModes.includes(parsed.executionMode)
      ? parsed.executionMode
      : "sequential";

    const taskIds = new Set(parsed.tasks.map((t) => t.id));

    const tasks: Task[] = parsed.tasks.map((t, idx) => {
      // Validate agent assignments — filter out non-existent agents
      const validAgents = (t.assignedAgentIds ?? []).filter(
        (id) => this.agentLoader.getAgent(id) !== null
      );

      // If no valid agents, try to find one via keywords
      if (validAgents.length === 0) {
        const keywordAgents = this.agentLoader.findAgents(t.description);
        if (keywordAgents.length > 0) {
          validAgents.push(keywordAgents[0].id);
        }
      }

      // Filter dependencies to valid task IDs
      const validDeps = (t.dependencies ?? []).filter((d) => taskIds.has(d) && d !== t.id);

      return {
        id: t.id || `task-${idx + 1}`,
        description: t.description || `Task ${idx + 1}`,
        assignedAgents: validAgents,
        dependencies: validDeps,
        status: "pending" as const,
        prompt: t.prompt || t.description,
        retryCount: 0,
        maxRetries: this.config.maxRetriesPerTask,
      };
    });

    const requiredAgents = [...new Set(tasks.flatMap((t) => t.assignedAgents))];

    return {
      id: `plan-${randomUUID().slice(0, 8)}`,
      objective,
      tasks,
      executionMode,
      estimatedDuration: parsed.estimatedDuration || "unknown",
      requiredAgents,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create a plan using rule-based decomposition (no LLM required).
   * Useful as a fallback when the LLM is unavailable.
   */
  createFallbackPlan(objective: string): OrchestrationPlan {
    // Find the most relevant agents for this objective
    const matchedAgents = this.agentLoader.findAgents(objective);
    const topAgents = matchedAgents.slice(0, Math.min(5, matchedAgents.length));

    if (topAgents.length === 0) {
      // Single-task fallback with no specific agent
      return {
        id: `plan-${randomUUID().slice(0, 8)}`,
        objective,
        tasks: [
          {
            id: "task-1",
            description: objective,
            assignedAgents: [],
            dependencies: [],
            status: "pending",
            prompt: objective,
            retryCount: 0,
            maxRetries: this.config.maxRetriesPerTask,
          },
        ],
        executionMode: "sequential",
        estimatedDuration: "unknown",
        requiredAgents: [],
        createdAt: new Date().toISOString(),
      };
    }

    const tasks: Task[] = topAgents.map((agent, idx) => ({
      id: `task-${idx + 1}`,
      description: `${agent.name}: Analyze and execute aspects of "${objective}" within your expertise (${agent.division})`,
      assignedAgents: [agent.id],
      dependencies: idx === 0 ? [] : [`task-1`], // All depend on the first analysis
      status: "pending" as const,
      prompt: `As ${agent.name} (${agent.description}), address the following objective:\n\n${objective}\n\nFocus on your area of expertise and provide concrete, actionable deliverables.`,
      retryCount: 0,
      maxRetries: this.config.maxRetriesPerTask,
    }));

    // Add a compilation task
    tasks.push({
      id: `task-${topAgents.length + 1}`,
      description: "Compile all agent outputs into a unified deliverable",
      assignedAgents: [],
      dependencies: tasks.map((t) => t.id),
      status: "pending",
      prompt: "Compile and synthesize all previous task outputs into a cohesive, actionable deliverable.",
      retryCount: 0,
      maxRetries: this.config.maxRetriesPerTask,
    });

    return {
      id: `plan-${randomUUID().slice(0, 8)}`,
      objective,
      tasks,
      executionMode: "mixed",
      estimatedDuration: `${topAgents.length * 2}-${topAgents.length * 4} minutes`,
      requiredAgents: topAgents.map((a) => a.id),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Format a plan for human-readable display.
   */
  formatPlan(plan: OrchestrationPlan): string {
    const lines: string[] = [
      `## 📋 Orchestration Plan`,
      `**Objective:** ${plan.objective}`,
      `**Mode:** ${plan.executionMode} | **Est. Duration:** ${plan.estimatedDuration}`,
      `**Agents:** ${plan.requiredAgents.length} | **Tasks:** ${plan.tasks.length}`,
      ``,
    ];

    for (const task of plan.tasks) {
      const agentNames = task.assignedAgents
        .map((id) => {
          const agent = this.agentLoader.getAgent(id);
          return agent ? `${agent.emoji} ${agent.name}` : id;
        })
        .join(", ");

      const deps = task.dependencies.length > 0
        ? ` (after: ${task.dependencies.join(", ")})`
        : "";

      const statusIcon = {
        pending: "⏳",
        running: "🔄",
        completed: "✅",
        failed: "❌",
        skipped: "⏭️",
      }[task.status];

      lines.push(`${statusIcon} **${task.id}**: ${task.description}`);
      if (agentNames) lines.push(`   → Agents: ${agentNames}${deps}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}
