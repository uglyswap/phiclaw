/**
 * PhiClaw Orchestrator — Executor
 *
 * The Executor takes a validated OrchestrationPlan and runs each task
 * in order, respecting dependencies and concurrency limits.
 *
 * Execution strategy:
 *  - Sequential: tasks run one by one in order
 *  - Parallel: independent tasks run concurrently (up to maxConcurrent)
 *  - Mixed: groups of independent tasks run in parallel waves
 *
 * Each task is executed by constructing a prompt from the agent's full profile
 * plus the task-specific prompt, then delegating to the configured LLM.
 */

import type { AgentLoader } from "./agent-loader.js";
import type {
  OrchestrationPlan,
  Task,
  TaskResult,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorEventHandler,
} from "./types.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./types.js";

// ─── Agent Prompt Builder ──────────────────────────────────

/**
 * Build a complete prompt for an agent to execute a task.
 * Includes the agent's personality, the task description, and context
 * from previously completed tasks.
 */
function buildAgentPrompt(
  agentLoader: AgentLoader,
  task: Task,
  completedTasks: Task[],
): string {
  const sections: string[] = [];

  // Agent profile(s)
  for (const agentId of task.assignedAgents) {
    const profile = agentLoader.getAgentProfile(agentId);
    if (profile) {
      sections.push(
        `## Agent: ${profile.emoji} ${profile.name}\n\n${profile.body.slice(0, 3000)}`
      );
    }
  }

  // Context from completed tasks
  if (completedTasks.length > 0) {
    sections.push(`## Context from Previous Tasks\n`);
    for (const ct of completedTasks) {
      if (ct.result) {
        sections.push(`### ${ct.id}: ${ct.description}\n${ct.result.slice(0, 1500)}\n`);
      }
    }
  }

  // Task prompt
  sections.push(`## Your Task\n\n${task.prompt}`);

  sections.push(
    `\n## Instructions\n` +
    `- Focus on delivering concrete, actionable output\n` +
    `- Be specific and detailed\n` +
    `- Format your response clearly with headers and structure\n` +
    `- If the task requires code, provide complete, working code\n` +
    `- Do not include meta-commentary about yourself\n`
  );

  return sections.join("\n\n");
}

// ─── LLM Caller Interface ──────────────────────────────────

/**
 * Interface for calling the LLM. This is implemented by the host application
 * (OpenClaw) to integrate with the configured model provider.
 */
export interface LLMCaller {
  /**
   * Send a prompt to the LLM and get a response.
   * @param systemPrompt System-level instructions
   * @param userPrompt User-level prompt
   * @param model Model identifier (e.g. "anthropic/claude-sonnet-4-20250514")
   * @returns The LLM's text response
   */
  call(systemPrompt: string, userPrompt: string, model?: string): Promise<string>;
}

/**
 * Default LLM caller that returns a placeholder.
 * Used when no LLM integration is configured — the Executor
 * still works for plan validation and dry runs.
 */
export const NOOP_LLM_CALLER: LLMCaller = {
  async call(_systemPrompt: string, userPrompt: string): Promise<string> {
    return `[Agent would process: ${userPrompt.slice(0, 200)}...]`;
  },
};

// ─── Executor Class ────────────────────────────────────────

export class Executor {
  private agentLoader: AgentLoader;
  private config: OrchestratorConfig;
  private llmCaller: LLMCaller;
  private eventHandlers: OrchestratorEventHandler[] = [];

  constructor(
    agentLoader: AgentLoader,
    llmCaller?: LLMCaller,
    config?: Partial<OrchestratorConfig>,
  ) {
    this.agentLoader = agentLoader;
    this.llmCaller = llmCaller ?? NOOP_LLM_CALLER;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  /**
   * Register an event handler for execution progress updates.
   */
  onEvent(handler: OrchestratorEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Execute a complete orchestration plan.
   */
  async execute(plan: OrchestrationPlan): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const completedTasks: Task[] = [];

    this.emit({
      type: "plan-created",
      timestamp: new Date().toISOString(),
      planId: plan.id,
      message: `Starting execution of plan "${plan.objective}" with ${plan.tasks.length} tasks`,
    });

    switch (plan.executionMode) {
      case "sequential":
        await this.executeSequential(plan, results, completedTasks);
        break;
      case "parallel":
        await this.executeParallel(plan, results, completedTasks);
        break;
      case "mixed":
        await this.executeMixed(plan, results, completedTasks);
        break;
    }

    return results;
  }

  /**
   * Execute all tasks sequentially, one after another.
   */
  private async executeSequential(
    plan: OrchestrationPlan,
    results: TaskResult[],
    completedTasks: Task[],
  ): Promise<void> {
    for (const task of plan.tasks) {
      const result = await this.executeTask(task, plan.id, completedTasks);
      results.push(result);
      if (result.status === "completed") {
        completedTasks.push(task);
      }
    }
  }

  /**
   * Execute all independent tasks in parallel, then dependent tasks.
   */
  private async executeParallel(
    plan: OrchestrationPlan,
    results: TaskResult[],
    completedTasks: Task[],
  ): Promise<void> {
    const waves = this.buildExecutionWaves(plan.tasks);

    for (const wave of waves) {
      const waveResults = await this.executeWave(wave, plan.id, completedTasks);
      results.push(...waveResults);

      for (let i = 0; i < wave.length; i++) {
        if (waveResults[i].status === "completed") {
          completedTasks.push(wave[i]);
        }
      }
    }
  }

  /**
   * Execute tasks in mixed mode — parallel waves where possible,
   * sequential where dependencies require it.
   */
  private async executeMixed(
    plan: OrchestrationPlan,
    results: TaskResult[],
    completedTasks: Task[],
  ): Promise<void> {
    // Mixed mode uses the same wave-based approach as parallel
    await this.executeParallel(plan, results, completedTasks);
  }

  /**
   * Build execution waves — groups of tasks that can run concurrently.
   * A task can run in a wave if all its dependencies are in earlier waves.
   */
  private buildExecutionWaves(tasks: Task[]): Task[][] {
    const waves: Task[][] = [];
    const completed = new Set<string>();
    const remaining = [...tasks];

    while (remaining.length > 0) {
      const wave: Task[] = [];

      // Find all tasks whose dependencies are satisfied
      const stillRemaining: Task[] = [];
      for (const task of remaining) {
        const depsCompleted = task.dependencies.every((d) => completed.has(d));
        if (depsCompleted) {
          wave.push(task);
        } else {
          stillRemaining.push(task);
        }
      }

      // If no tasks can run, we have a circular dependency — break it
      if (wave.length === 0 && stillRemaining.length > 0) {
        wave.push(stillRemaining.shift()!);
        remaining.length = 0;
        remaining.push(...stillRemaining);
      } else {
        remaining.length = 0;
        remaining.push(...stillRemaining);
      }

      // Respect concurrency limit
      while (wave.length > this.config.maxConcurrentTasks) {
        const overflow = wave.splice(this.config.maxConcurrentTasks);
        waves.push([...wave]);
        wave.length = 0;
        wave.push(...overflow);
      }

      if (wave.length > 0) {
        waves.push(wave);
        for (const t of wave) {
          completed.add(t.id);
        }
      }
    }

    return waves;
  }

  /**
   * Execute a wave of tasks concurrently.
   */
  private async executeWave(
    wave: Task[],
    planId: string,
    completedTasks: Task[],
  ): Promise<TaskResult[]> {
    const promises = wave.map((task) => this.executeTask(task, planId, completedTasks));
    return Promise.all(promises);
  }

  /**
   * Execute a single task with retry logic.
   */
  private async executeTask(
    task: Task,
    planId: string,
    completedTasks: Task[],
  ): Promise<TaskResult> {
    const startTime = Date.now();
    task.status = "running";

    this.emit({
      type: "task-started",
      timestamp: new Date().toISOString(),
      planId,
      taskId: task.id,
      message: `Starting task: ${task.description}`,
    });

    while (task.retryCount <= task.maxRetries) {
      try {
        const result = await this.callAgent(task, completedTasks);
        const durationMs = Date.now() - startTime;

        task.status = "completed";
        task.result = result;
        task.metrics = {
          durationMs,
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          agentsUsed: task.assignedAgents.length,
        };

        this.emit({
          type: "task-completed",
          timestamp: new Date().toISOString(),
          planId,
          taskId: task.id,
          message: `Task completed in ${Math.round(durationMs / 1000)}s`,
        });

        return {
          taskId: task.id,
          taskDescription: task.description,
          agentNames: task.assignedAgents.map((id) => {
            const agent = this.agentLoader.getAgent(id);
            return agent ? agent.name : id;
          }),
          status: "completed",
          result,
          durationMs,
        };
      } catch (err) {
        task.retryCount++;
        const errMsg = err instanceof Error ? err.message : String(err);

        if (task.retryCount <= task.maxRetries) {
          this.emit({
            type: "task-retrying",
            timestamp: new Date().toISOString(),
            planId,
            taskId: task.id,
            message: `Task failed (attempt ${task.retryCount}/${task.maxRetries + 1}): ${errMsg}. Retrying...`,
          });
          // Exponential backoff: 1s, 2s, 4s...
          await this.sleep(1000 * Math.pow(2, task.retryCount - 1));
        } else {
          const durationMs = Date.now() - startTime;
          task.status = "failed";
          task.error = errMsg;

          this.emit({
            type: "task-failed",
            timestamp: new Date().toISOString(),
            planId,
            taskId: task.id,
            message: `Task failed after ${task.retryCount} attempts: ${errMsg}`,
          });

          return {
            taskId: task.id,
            taskDescription: task.description,
            agentNames: task.assignedAgents.map((id) => {
              const agent = this.agentLoader.getAgent(id);
              return agent ? agent.name : id;
            }),
            status: "failed",
            result: "",
            error: errMsg,
            durationMs,
          };
        }
      }
    }

    // Should not reach here, but TypeScript needs it
    const durationMs = Date.now() - startTime;
    return {
      taskId: task.id,
      taskDescription: task.description,
      agentNames: [],
      status: "failed",
      result: "",
      error: "Unexpected execution path",
      durationMs,
    };
  }

  /**
   * Call the LLM with the agent's profile and task prompt.
   */
  private async callAgent(task: Task, completedTasks: Task[]): Promise<string> {
    const prompt = buildAgentPrompt(this.agentLoader, task, completedTasks);

    const systemPrompt =
      `You are a specialized AI agent executing a task as part of a multi-agent orchestration. ` +
      `Focus exclusively on your assigned task and deliver high-quality, actionable output. ` +
      `Be specific, structured, and thorough.`;

    const response = await Promise.race([
      this.llmCaller.call(systemPrompt, prompt, this.config.defaultModel),
      this.timeout(this.config.taskTimeoutMs),
    ]);

    if (!response || response.length === 0) {
      throw new Error("Empty response from LLM");
    }

    return response;
  }

  /**
   * Create a timeout promise that rejects after the specified duration.
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
    });
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit an orchestration event to all registered handlers.
   */
  private emit(event: OrchestratorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Event handlers should not crash the executor
      }
    }
  }
}
