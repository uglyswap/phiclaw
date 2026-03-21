/**
 * PhiClaw Orchestrator — Router
 *
 * The Router is responsible for matching tasks to the most appropriate agent(s).
 * It uses a multi-signal scoring approach:
 *  1. Keyword matching (agent keywords vs task description)
 *  2. Division affinity (task domain vs agent division)
 *  3. Name/description similarity
 *  4. Tool capability matching
 *
 * The Router can also suggest alternative agents if the primary choice is unavailable.
 */

import type { AgentLoader, AgentMeta } from "./agent-loader.js";
import type { Task } from "./types.js";

// ─── Division Keywords Map ─────────────────────────────────

/**
 * Maps common task-domain keywords to agent divisions.
 * Used for domain-level routing when keyword matching is insufficient.
 */
const DIVISION_KEYWORDS: Record<string, string[]> = {
  academic: [
    "research", "study", "analysis", "paper", "literature", "history",
    "psychology", "geography", "anthropology", "narrative", "theory",
  ],
  design: [
    "ui", "ux", "user interface", "user experience", "brand", "visual",
    "design", "wireframe", "mockup", "prototype", "accessibility",
    "inclusive", "storytelling", "whimsy",
  ],
  engineering: [
    "code", "programming", "backend", "frontend", "api", "database",
    "devops", "security", "architecture", "microservice", "deployment",
    "docker", "kubernetes", "testing", "mobile", "app", "web",
    "firmware", "embedded", "blockchain", "solidity", "smart contract",
    "git", "ci/cd", "incident", "sre", "reliability",
  ],
  "game-development": [
    "game", "unity", "unreal", "godot", "roblox", "blender",
    "shader", "multiplayer", "level design", "narrative design",
    "audio", "3d", "animation", "vfx",
  ],
  marketing: [
    "seo", "content", "social media", "growth", "tiktok", "instagram",
    "linkedin", "twitter", "reddit", "podcast", "video", "ecommerce",
    "marketing", "brand", "campaign", "engagement", "audience",
    "influencer", "blog", "article", "newsletter",
  ],
  "paid-media": [
    "ads", "advertising", "ppc", "paid", "programmatic", "media buy",
    "creative", "tracking", "conversion", "roi", "budget", "campaign",
    "google ads", "facebook ads", "display",
  ],
  product: [
    "product", "roadmap", "feature", "prioritization", "sprint",
    "feedback", "user research", "mvp", "launch", "metrics",
    "kpi", "okr", "trend",
  ],
  "project-management": [
    "project", "timeline", "milestone", "jira", "agile", "scrum",
    "sprint", "kanban", "backlog", "stakeholder", "planning",
    "coordination", "studio", "production",
  ],
  sales: [
    "sales", "pipeline", "deal", "prospect", "outbound", "discovery",
    "proposal", "demo", "negotiation", "closing", "revenue",
    "account", "crm",
  ],
  "spatial-computing": [
    "vr", "ar", "xr", "spatial", "visionos", "metal", "immersive",
    "3d interface", "cockpit", "headset", "mixed reality",
  ],
  specialized: [
    "compliance", "legal", "recruitment", "hiring", "blockchain",
    "audit", "training", "report", "document", "workflow",
    "automation", "identity", "supply chain", "consulting",
  ],
  support: [
    "support", "analytics", "reporting", "finance", "budget",
    "infrastructure", "maintenance", "legal", "customer service",
  ],
  testing: [
    "test", "qa", "quality", "accessibility", "performance",
    "benchmark", "api test", "workflow", "evidence", "evaluation",
  ],
};

// ─── Router Class ──────────────────────────────────────────

export interface RouteResult {
  /** Best-matching agents, ordered by relevance score */
  agents: AgentMeta[];
  /** Scoring details for transparency */
  scores: Map<string, number>;
  /** Division that best matches the task domain */
  matchedDivision: string | null;
}

export class Router {
  private agentLoader: AgentLoader;

  constructor(agentLoader: AgentLoader) {
    this.agentLoader = agentLoader;
  }

  /**
   * Route a task to the best-matching agent(s).
   *
   * @param task The task to route
   * @param maxAgents Maximum number of agents to return (default: 3)
   * @returns RouteResult with ordered agents and scoring details
   */
  route(task: Task, maxAgents: number = 3): RouteResult {
    const description = task.description.toLowerCase();
    const prompt = task.prompt.toLowerCase();
    const searchText = `${description} ${prompt}`;

    // Step 1: Identify the most relevant division
    const matchedDivision = this.matchDivision(searchText);

    // Step 2: Score all agents
    const scores = new Map<string, number>();
    const allAgents = this.agentLoader.listAllAgents();

    for (const agent of allAgents) {
      let score = 0;

      // Division match bonus
      if (matchedDivision && agent.division === matchedDivision) {
        score += 5;
      }

      // Keyword match
      for (const keyword of agent.keywords) {
        if (searchText.includes(keyword)) {
          score += 3;
        }
      }

      // Name match (high value)
      const nameLower = agent.name.toLowerCase();
      if (searchText.includes(nameLower)) {
        score += 15;
      }

      // Partial name match
      const nameWords = nameLower.split(/\s+/);
      for (const word of nameWords) {
        if (word.length > 3 && searchText.includes(word)) {
          score += 4;
        }
      }

      // Description term overlap
      const descWords = agent.description.toLowerCase().split(/\s+/);
      const searchWords = new Set(searchText.split(/\s+/));
      let descOverlap = 0;
      for (const word of descWords) {
        if (word.length > 3 && searchWords.has(word)) {
          descOverlap++;
        }
      }
      score += Math.min(descOverlap, 5); // Cap at 5 to avoid description-heavy bias

      if (score > 0) {
        scores.set(agent.id, score);
      }
    }

    // Step 3: Sort by score and return top N
    const sortedAgents = allAgents
      .filter((a) => (scores.get(a.id) ?? 0) > 0)
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, maxAgents);

    return {
      agents: sortedAgents,
      scores,
      matchedDivision,
    };
  }

  /**
   * Route a task described only by a text query (no Task object needed).
   */
  routeByQuery(query: string, maxAgents: number = 3): RouteResult {
    const pseudoTask: Task = {
      id: "query",
      description: query,
      assignedAgents: [],
      dependencies: [],
      status: "pending",
      prompt: query,
      retryCount: 0,
      maxRetries: 0,
    };
    return this.route(pseudoTask, maxAgents);
  }

  /**
   * Match a text query to the most relevant division.
   */
  private matchDivision(text: string): string | null {
    let bestDivision: string | null = null;
    let bestScore = 0;

    for (const [division, keywords] of Object.entries(DIVISION_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          score += keyword.includes(" ") ? 3 : 1; // Multi-word matches score higher
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestDivision = division;
      }
    }

    return bestDivision;
  }

  /**
   * Suggest alternative agents for a task if the primary agents are unavailable.
   */
  suggestAlternatives(task: Task, excludeIds: string[]): AgentMeta[] {
    const result = this.route(task, 5);
    return result.agents.filter((a) => !excludeIds.includes(a.id));
  }
}
