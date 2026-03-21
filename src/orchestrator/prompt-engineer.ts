/**
 * PhiClaw — Prompt Engineer Module
 *
 * Intercepts raw user prompts and transforms them into optimized,
 * structured prompts for the orchestrator.
 *
 * Pipeline:
 *  1. Intent Analysis — determine what the user actually wants
 *  2. Context Enrichment — inject relevant agent/domain context
 *  3. Prompt Structuring — apply prompt engineering best practices
 *  4. Agent Hinting — identify which agents/divisions are relevant
 *
 * This module can operate in two modes:
 *  - LLM-assisted: uses an LLM to intelligently transform the prompt
 *  - Rule-based: applies heuristic transformations without LLM calls
 */

import type { AgentLoader } from "./agent-loader.js";
import type { LLMCaller } from "./executor.js";

// ─── Configuration ─────────────────────────────────────────

export interface PromptEngineerConfig {
  /** Whether the prompt engineer is enabled */
  enabled: boolean;
  /** Model to use for prompt transformation */
  model: string;
  /** Maximum length of the transformed prompt */
  maxPromptLength: number;
  /** Whether to include agent suggestions in the output */
  includeAgentSuggestions: boolean;
  /** Whether to use LLM for transformation (false = rule-based only) */
  useLLM: boolean;
}

export const DEFAULT_PROMPT_ENGINEER_CONFIG: PromptEngineerConfig = {
  enabled: true,
  model: "anthropic/claude-sonnet-4-20250514",
  maxPromptLength: 4000,
  includeAgentSuggestions: true,
  useLLM: true,
};

// ─── Prompt Engineer Output ────────────────────────────────

export interface EngineerResult {
  /** The original user prompt */
  originalPrompt: string;
  /** The optimized/structured prompt */
  engineeredPrompt: string;
  /** Detected user intent */
  intent: PromptIntent;
  /** Suggested agent IDs for this task */
  suggestedAgentIds: string[];
  /** Suggested divisions for this task */
  suggestedDivisions: string[];
  /** Whether the prompt was transformed by LLM or rules */
  transformMethod: "llm" | "rules";
  /** Complexity assessment */
  complexity: "simple" | "moderate" | "complex";
}

export interface PromptIntent {
  /** Primary action type */
  action: "create" | "analyze" | "optimize" | "fix" | "plan" | "research" | "other";
  /** Domain/topic area */
  domain: string;
  /** Key entities mentioned */
  entities: string[];
  /** Whether orchestration (multi-agent) is needed */
  needsOrchestration: boolean;
}

// ─── LLM Prompt for Transformation ────────────────────────

const TRANSFORMATION_PROMPT = `You are PhiClaw's Prompt Engineer. Transform the user's raw prompt into a structured, optimized prompt for multi-agent orchestration.

Analyze the prompt and produce a JSON response with:
1. The transformed prompt (clearer, more structured, with explicit deliverables)
2. Intent analysis (action type, domain, entities)
3. Complexity assessment
4. Whether multi-agent orchestration is needed

INPUT PROMPT:
{USER_PROMPT}

AVAILABLE DIVISIONS: {DIVISIONS}

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "engineeredPrompt": "The optimized prompt with clear structure, objectives, and deliverables",
  "intent": {
    "action": "create|analyze|optimize|fix|plan|research|other",
    "domain": "primary domain area",
    "entities": ["key", "entities", "mentioned"],
    "needsOrchestration": true
  },
  "complexity": "simple|moderate|complex",
  "suggestedDivisions": ["engineering", "marketing"]
}`;

// ─── Intent Detection Rules ────────────────────────────────

const ACTION_KEYWORDS: Record<string, string[]> = {
  create: [
    "create", "build", "make", "develop", "write", "design", "implement",
    "generate", "produce", "craft", "compose", "construct", "launch",
    "deploy", "set up", "start", "establish",
  ],
  analyze: [
    "analyze", "review", "audit", "assess", "evaluate", "examine",
    "inspect", "investigate", "diagnose", "study", "compare",
  ],
  optimize: [
    "optimize", "improve", "enhance", "boost", "increase", "upgrade",
    "refine", "streamline", "accelerate", "scale",
  ],
  fix: [
    "fix", "repair", "debug", "resolve", "troubleshoot", "patch",
    "correct", "solve", "address",
  ],
  plan: [
    "plan", "strategy", "roadmap", "schedule", "organize", "coordinate",
    "prioritize", "outline",
  ],
  research: [
    "research", "explore", "discover", "learn", "understand", "find",
    "search", "benchmark", "survey",
  ],
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "software-engineering": [
    "code", "api", "database", "server", "frontend", "backend",
    "app", "software", "system", "architecture", "deploy",
  ],
  marketing: [
    "seo", "content", "social media", "brand", "campaign", "audience",
    "growth", "marketing", "ads", "engagement",
  ],
  design: [
    "ui", "ux", "design", "wireframe", "mockup", "visual", "brand",
    "logo", "interface", "user experience",
  ],
  business: [
    "revenue", "profit", "market", "customer", "sales", "pricing",
    "business model", "startup", "saas", "b2b", "b2c",
  ],
  product: [
    "feature", "product", "roadmap", "user story", "prd", "mvp",
    "launch", "feedback", "metrics",
  ],
};

// ─── Prompt Engineer Class ─────────────────────────────────

export class PromptEngineer {
  private agentLoader: AgentLoader;
  private llmCaller: LLMCaller | null;
  private config: PromptEngineerConfig;

  constructor(
    agentLoader: AgentLoader,
    llmCaller?: LLMCaller,
    config?: Partial<PromptEngineerConfig>,
  ) {
    this.agentLoader = agentLoader;
    this.llmCaller = llmCaller ?? null;
    this.config = { ...DEFAULT_PROMPT_ENGINEER_CONFIG, ...config };
  }

  /**
   * Transform a raw user prompt into an optimized prompt for orchestration.
   */
  async engineer(rawPrompt: string): Promise<EngineerResult> {
    if (this.config.useLLM && this.llmCaller) {
      try {
        return await this.engineerWithLLM(rawPrompt);
      } catch {
        // Fallback to rules if LLM fails
        return this.engineerWithRules(rawPrompt);
      }
    }
    return this.engineerWithRules(rawPrompt);
  }

  /**
   * LLM-assisted prompt transformation.
   */
  private async engineerWithLLM(rawPrompt: string): Promise<EngineerResult> {
    const divisions = this.agentLoader
      .listDivisions()
      .map((d) => d.name)
      .join(", ");

    const prompt = TRANSFORMATION_PROMPT
      .replace("{USER_PROMPT}", rawPrompt)
      .replace("{DIVISIONS}", divisions);

    const response = await this.llmCaller!.call(
      "You are a prompt engineering specialist. Output valid JSON only.",
      prompt,
      this.config.model,
    );

    // Parse LLM response
    let cleaned = response.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

    const parsed = JSON.parse(cleaned) as {
      engineeredPrompt: string;
      intent: {
        action: string;
        domain: string;
        entities: string[];
        needsOrchestration: boolean;
      };
      complexity: string;
      suggestedDivisions: string[];
    };

    // Find suggested agents based on divisions
    const suggestedAgentIds: string[] = [];
    for (const div of parsed.suggestedDivisions ?? []) {
      const agents = this.agentLoader.listAgentsByDivision(div);
      if (agents.length > 0) {
        suggestedAgentIds.push(agents[0].id);
      }
    }

    // Also search by the engineered prompt
    if (this.config.includeAgentSuggestions) {
      const searchResults = this.agentLoader.findAgents(parsed.engineeredPrompt);
      for (const agent of searchResults.slice(0, 5)) {
        if (!suggestedAgentIds.includes(agent.id)) {
          suggestedAgentIds.push(agent.id);
        }
      }
    }

    const validActions = ["create", "analyze", "optimize", "fix", "plan", "research", "other"] as const;
    const action = validActions.includes(parsed.intent.action as typeof validActions[number])
      ? (parsed.intent.action as typeof validActions[number])
      : "other";

    const validComplexity = ["simple", "moderate", "complex"] as const;
    const complexity = validComplexity.includes(parsed.complexity as typeof validComplexity[number])
      ? (parsed.complexity as typeof validComplexity[number])
      : "moderate";

    return {
      originalPrompt: rawPrompt,
      engineeredPrompt: parsed.engineeredPrompt || rawPrompt,
      intent: {
        action,
        domain: parsed.intent.domain || "general",
        entities: parsed.intent.entities || [],
        needsOrchestration: parsed.intent.needsOrchestration ?? true,
      },
      suggestedAgentIds,
      suggestedDivisions: parsed.suggestedDivisions || [],
      transformMethod: "llm",
      complexity,
    };
  }

  /**
   * Rule-based prompt transformation (no LLM needed).
   */
  engineerWithRules(rawPrompt: string): EngineerResult {
    const lower = rawPrompt.toLowerCase();

    // Detect action
    let detectedAction: EngineerResult["intent"]["action"] = "other";
    let bestActionScore = 0;
    for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
      const score = keywords.filter((k) => lower.includes(k)).length;
      if (score > bestActionScore) {
        bestActionScore = score;
        detectedAction = action as EngineerResult["intent"]["action"];
      }
    }

    // Detect domain
    let detectedDomain = "general";
    let bestDomainScore = 0;
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const score = keywords.filter((k) => lower.includes(k)).length;
      if (score > bestDomainScore) {
        bestDomainScore = score;
        detectedDomain = domain;
      }
    }

    // Detect complexity
    const wordCount = rawPrompt.split(/\s+/).length;
    let complexity: EngineerResult["complexity"] = "simple";
    if (wordCount > 50 || lower.includes("and") && lower.includes("then")) {
      complexity = "complex";
    } else if (wordCount > 20) {
      complexity = "moderate";
    }

    // Determine if orchestration is needed
    const needsOrchestration =
      complexity !== "simple" ||
      lower.includes("team") ||
      lower.includes("plan") ||
      lower.includes("strategy") ||
      lower.includes("launch") ||
      lower.includes("comprehensive") ||
      lower.includes("full") ||
      lower.includes("complete");

    // Find suggested agents
    const agents = this.agentLoader.findAgents(rawPrompt);
    const suggestedAgentIds = agents.slice(0, 5).map((a) => a.id);
    const suggestedDivisions = [...new Set(agents.slice(0, 5).map((a) => a.division))];

    // Build engineered prompt
    const engineeredPrompt = this.structurePrompt(
      rawPrompt,
      detectedAction,
      detectedDomain,
      complexity,
    );

    return {
      originalPrompt: rawPrompt,
      engineeredPrompt,
      intent: {
        action: detectedAction,
        domain: detectedDomain,
        entities: this.extractEntities(rawPrompt),
        needsOrchestration,
      },
      suggestedAgentIds,
      suggestedDivisions,
      transformMethod: "rules",
      complexity,
    };
  }

  /**
   * Structure a prompt using prompt engineering best practices.
   */
  private structurePrompt(
    rawPrompt: string,
    action: string,
    domain: string,
    complexity: string,
  ): string {
    const sections: string[] = [];

    // Clear objective statement
    sections.push(`## Objective\n${rawPrompt}`);

    // Add domain context
    sections.push(`\n## Context\n- Domain: ${domain}\n- Action: ${action}\n- Complexity: ${complexity}`);

    // Add deliverable expectations
    sections.push(
      `\n## Expected Deliverables\n` +
      `- Concrete, actionable output (not abstract recommendations)\n` +
      `- Structured with clear headers and sections\n` +
      `- Include specific examples, templates, or code where applicable\n` +
      `- Provide metrics or success criteria where relevant`,
    );

    // Add constraints
    sections.push(
      `\n## Constraints\n` +
      `- Professional quality — production-ready output\n` +
      `- Be specific to the user's context\n` +
      `- Avoid generic advice — provide tailored recommendations`,
    );

    return sections.join("\n");
  }

  /**
   * Extract potential entities (proper nouns, quoted strings) from the prompt.
   */
  private extractEntities(text: string): string[] {
    const entities: string[] = [];

    // Extract quoted strings
    const quotedMatches = text.match(/["']([^"']+)["']/g);
    if (quotedMatches) {
      for (const match of quotedMatches) {
        entities.push(match.replace(/["']/g, ""));
      }
    }

    // Extract URLs/domains
    const urlMatches = text.match(/\b(?:https?:\/\/)?[\w-]+\.[\w.]+\b/g);
    if (urlMatches) {
      for (const match of urlMatches) {
        if (!entities.includes(match)) {
          entities.push(match);
        }
      }
    }

    // Extract capitalized multi-word phrases (potential proper nouns)
    const capitalizedMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
    if (capitalizedMatches) {
      for (const match of capitalizedMatches) {
        if (!entities.includes(match)) {
          entities.push(match);
        }
      }
    }

    return entities;
  }
}
