/**
 * PhiClaw Orchestrator — Main Entry Point
 *
 * The Orchestrator is the central coordination engine of PhiClaw.
 * It provides a unified API for:
 *  - Creating execution plans from user objectives
 *  - Routing tasks to specialized agents
 *  - Executing plans with parallel/sequential strategies
 *  - Compiling results into unified deliverables
 *
 * Usage:
 *   const orchestrator = new Orchestrator(agentLoader);
 *   const result = await orchestrator.orchestrate("Launch my SaaS in France");
 */

import type { AgentLoader, AgentMeta } from "./agent-loader.js";
import { Planner } from "./planner.js";
import { Router, type RouteResult } from "./router.js";
import { Executor, type LLMCaller, NOOP_LLM_CALLER } from "./executor.js";
import { Compiler } from "./compiler.js";
import type {
  OrchestrationPlan,
  OrchestrationResult,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorEventHandler,
} from "./types.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./types.js";

// ─── Re-exports ────────────────────────────────────────────

export { AgentLoader, createAgentLoader, getDefaultAgentLoader } from "./agent-loader.js";
export type { AgentMeta, AgentProfile, AgentFrontMatter, DivisionInfo } from "./agent-loader.js";
export { Planner } from "./planner.js";
export { Router } from "./router.js";
export type { RouteResult } from "./router.js";
export { Executor, NOOP_LLM_CALLER } from "./executor.js";
export type { LLMCaller } from "./executor.js";
export { Compiler } from "./compiler.js";
export * from "./types.js";

// ─── Orchestrator Class ────────────────────────────────────

export interface OrchestrateOptions {
  /** Override execution mode */
  executionMode?: "sequential" | "parallel" | "mixed";
  /** Dry run — generate plan without executing */
  dryRun?: boolean;
  /** Use LLM for intelligent result compilation */
  intelligentCompilation?: boolean;
  /** Override max tasks */
  maxTasks?: number;
  /** Custom event handler for this orchestration */
  onEvent?: OrchestratorEventHandler;
}

export class Orchestrator {
  private planner: Planner;
  private router: Router;
  private executor: Executor;
  private compiler: Compiler;
  private agentLoader: AgentLoader;
  private config: OrchestratorConfig;
  private eventHandlers: OrchestratorEventHandler[] = [];
  private history: OrchestrationResult[] = [];

  constructor(
    agentLoader: AgentLoader,
    llmCaller?: LLMCaller,
    config?: Partial<OrchestratorConfig>,
  ) {
    this.agentLoader = agentLoader;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    const caller = llmCaller ?? NOOP_LLM_CALLER;

    this.planner = new Planner(agentLoader, this.config);
    this.router = new Router(agentLoader);
    this.executor = new Executor(agentLoader, caller, this.config);
    this.compiler = new Compiler(agentLoader, caller);

    // Wire up event forwarding from executor
    this.executor.onEvent((event) => this.emit(event));
  }

  /**
   * Register a global event handler for all orchestrations.
   */
  onEvent(handler: OrchestratorEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Full orchestration pipeline: plan → route → execute → compile.
   *
   * @param objective The user's high-level objective
   * @param llmPlanOutput Optional pre-generated plan JSON from an LLM
   * @param options Execution options
   */
  async orchestrate(
    objective: string,
    llmPlanOutput?: string,
    options?: OrchestrateOptions,
  ): Promise<OrchestrationResult> {
    // Step 1: Create the plan
    let plan: OrchestrationPlan;

    if (llmPlanOutput) {
      plan = this.planner.parsePlanResponse(objective, llmPlanOutput);
    } else {
      plan = this.planner.createFallbackPlan(objective);
    }

    // Apply option overrides
    if (options?.executionMode) {
      plan.executionMode = options.executionMode;
    }
    if (options?.maxTasks && plan.tasks.length > options.maxTasks) {
      plan.tasks = plan.tasks.slice(0, options.maxTasks);
    }

    // Register per-orchestration event handler
    if (options?.onEvent) {
      this.eventHandlers.push(options.onEvent);
    }

    // Step 2: Route — ensure all tasks have agent assignments
    for (const task of plan.tasks) {
      if (task.assignedAgents.length === 0) {
        const routeResult = this.router.route(task);
        if (routeResult.agents.length > 0) {
          task.assignedAgents = [routeResult.agents[0].id];
        }
      }
    }

    // Step 3: Dry run — return plan without executing
    if (options?.dryRun) {
      return {
        plan,
        status: "completed",
        deliverable: this.planner.formatPlan(plan),
        summary: `Dry run — ${plan.tasks.length} tasks planned, not executed`,
        totalDurationMs: 0,
        taskResults: [],
        completedAt: new Date().toISOString(),
      };
    }

    // Step 4: Execute
    const taskResults = await this.executor.execute(plan);

    // Step 5: Compile
    const result = await this.compiler.compile(
      plan,
      taskResults,
      options?.intelligentCompilation ?? false,
    );

    // Step 6: Record in history
    this.history.push(result);

    // Clean up per-orchestration handler
    if (options?.onEvent) {
      const idx = this.eventHandlers.indexOf(options.onEvent);
      if (idx !== -1) this.eventHandlers.splice(idx, 1);
    }

    return result;
  }

  /**
   * Generate a plan without executing (alias for orchestrate with dryRun).
   */
  async plan(objective: string, llmPlanOutput?: string): Promise<OrchestrationResult> {
    return this.orchestrate(objective, llmPlanOutput, { dryRun: true });
  }

  /**
   * Get the planning prompt to send to an LLM.
   * The LLM's response should be passed as llmPlanOutput to orchestrate().
   */
  getPlanningPrompt(objective: string): string {
    return this.planner.buildPlanningPrompt(objective);
  }

  /**
   * Route a query to the best matching agents.
   */
  routeQuery(query: string, maxAgents?: number): RouteResult {
    return this.router.routeByQuery(query, maxAgents);
  }

  /**
   * List all available agents.
   */
  listAgents(): AgentMeta[] {
    return this.agentLoader.listAllAgents();
  }

  /**
   * List agents by division.
   */
  listAgentsByDivision(division: string): AgentMeta[] {
    return this.agentLoader.listAgentsByDivision(division);
  }

  /**
   * Get all divisions.
   */
  listDivisions() {
    return this.agentLoader.listDivisions();
  }

  /**
   * Search for agents.
   */
  findAgents(query: string): AgentMeta[] {
    return this.agentLoader.findAgents(query);
  }

  /**
   * Get an agent's full profile.
   */
  getAgentProfile(id: string) {
    return this.agentLoader.getAgentProfile(id);
  }

  /**
   * Get a formatted summary of all agents.
   */
  getAgentsSummary(): string {
    return this.agentLoader.getSummary();
  }

  /**
   * Get orchestration history.
   */
  getHistory(): OrchestrationResult[] {
    return [...this.history];
  }

  /**
   * Get the last orchestration result.
   */
  getLastResult(): OrchestrationResult | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /**
   * Format a result for chat display.
   */
  formatResultForChat(result: OrchestrationResult): string {
    return this.compiler.formatForChat(result);
  }

  /**
   * Format a plan for human-readable display.
   */
  formatPlan(plan: OrchestrationPlan): string {
    return this.planner.formatPlan(plan);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Get the total number of loaded agents.
   */
  get agentCount(): number {
    return this.agentLoader.count;
  }

  /**
   * Emit an event to all registered handlers.
   */
  private emit(event: OrchestratorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Handlers should not crash the orchestrator
      }
    }
  }
}

// ─── Factory Function ──────────────────────────────────────

/**
 * Create a fully configured Orchestrator instance.
 *
 * @param agentsDir Path to the agents directory
 * @param llmCaller LLM integration (optional)
 * @param config Configuration overrides
 */
export function createOrchestrator(
  agentsDir: string,
  llmCaller?: LLMCaller,
  config?: Partial<OrchestratorConfig>,
): Orchestrator {
  const { createAgentLoader: createLoader } = require("./agent-loader.js") as {
    createAgentLoader: typeof import("./agent-loader.js").createAgentLoader;
  };
  const loader = createLoader(agentsDir);
  return new Orchestrator(loader, llmCaller, config);
}
