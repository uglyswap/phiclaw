/**
 * PhiClaw Agent Loader
 *
 * Parses the 144+ agent Markdown files from the agents/ directory,
 * extracts YAML front-matter metadata, and provides a typed API for
 * querying agents by id, name, division, keywords, or free-text search.
 *
 * Design goals:
 *  - Lazy-load full body on demand (only metadata at startup)
 *  - Division auto-detected from filesystem structure
 *  - Keyword extraction from description + name for routing
 *  - Thread-safe singleton via module scope
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname, relative, extname } from "node:path";
import { parse as parseYaml } from "yaml";

// ─── Types ─────────────────────────────────────────────────

/** Raw YAML front-matter fields present in agent Markdown files. */
export interface AgentFrontMatter {
  name: string;
  description: string;
  color?: string;
  emoji?: string;
  vibe?: string;
  tools?: string;
}

/** Fully resolved agent metadata (front-matter + derived fields). */
export interface AgentMeta {
  /** Stable kebab-case id derived from filename (e.g. "engineering-backend-architect") */
  id: string;
  /** Human-readable name from front-matter */
  name: string;
  /** One-line description */
  description: string;
  /** Division (top-level directory, e.g. "engineering") */
  division: string;
  /** Optional sub-division (e.g. "unity" inside game-development) */
  subDivision: string | null;
  /** Emoji icon */
  emoji: string;
  /** Vibe / one-liner personality */
  vibe: string;
  /** Color hint for UI */
  color: string;
  /** Comma-separated tool names from front-matter */
  tools: string[];
  /** Auto-extracted keywords for routing (lowercase, deduplicated) */
  keywords: string[];
  /** Absolute path to the Markdown file */
  filePath: string;
}

/** An agent with its full Markdown body loaded. */
export interface AgentProfile extends AgentMeta {
  /** Full Markdown body (everything after front-matter) */
  body: string;
}

/** Division summary. */
export interface DivisionInfo {
  name: string;
  agentCount: number;
  agentIds: string[];
}

// ─── Helpers ───────────────────────────────────────────────

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Common English stop-words to exclude from keyword extraction. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "or", "she",
  "that", "the", "this", "to", "was", "were", "will", "with", "who",
  "you", "your", "their", "them", "they", "not", "but", "can", "do",
  "does", "did", "had", "have", "how", "if", "may", "no", "nor",
  "our", "out", "own", "so", "than", "too", "very", "what", "when",
  "where", "which", "while", "about", "above", "after", "all", "also",
  "any", "because", "been", "before", "being", "between", "both",
  "each", "few", "get", "got", "into", "just", "more", "most",
  "much", "must", "need", "only", "other", "over", "same", "should",
  "some", "such", "take", "through", "under", "up", "use", "used",
  "using", "well", "would",
]);

/**
 * Extract meaningful keywords from a text string.
 * Returns deduplicated, lowercase tokens excluding stop-words.
 */
function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
}

/**
 * Parse YAML front-matter from a Markdown string.
 * Returns the parsed front-matter and the remaining body.
 */
function parseFrontMatter(content: string): { meta: AgentFrontMatter; body: string } | null {
  const match = FRONT_MATTER_RE.exec(content);
  if (!match) return null;

  try {
    const meta = parseYaml(match[1]) as AgentFrontMatter;
    if (!meta || typeof meta.name !== "string") return null;
    return { meta, body: match[2] };
  } catch {
    return null;
  }
}

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (extname(entry) === ".md" && entry !== "README.md" && entry !== "CONTRIBUTING.md") {
      results.push(full);
    }
  }

  return results;
}

// ─── Agent Loader Class ────────────────────────────────────

export class AgentLoader {
  private agents: Map<string, AgentMeta> = new Map();
  private divisions: Map<string, DivisionInfo> = new Map();
  private loaded = false;
  private agentsDir: string;

  constructor(agentsDir: string) {
    this.agentsDir = agentsDir;
  }

  /**
   * Load all agents from the agents directory.
   * Idempotent — subsequent calls are no-ops.
   */
  load(): void {
    if (this.loaded) return;

    const files = findMarkdownFiles(this.agentsDir);

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseFrontMatter(content);
      if (!parsed) continue;

      const { meta } = parsed;

      // Derive division from directory structure
      const rel = relative(this.agentsDir, filePath);
      const parts = rel.split("/");
      const division = parts[0];
      const subDivision = parts.length > 2 ? parts.slice(1, -1).join("/") : null;

      // Build stable id from filename
      const id = basename(filePath, ".md");

      // Extract keywords from name + description + vibe
      const keywordSource = [meta.name, meta.description, meta.vibe ?? ""].join(" ");
      const keywords = extractKeywords(keywordSource);

      // Parse tools
      const tools = meta.tools
        ? meta.tools.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const agent: AgentMeta = {
        id,
        name: meta.name,
        description: meta.description,
        division,
        subDivision,
        emoji: meta.emoji ?? "🤖",
        vibe: meta.vibe ?? "",
        color: meta.color ?? "#808080",
        tools,
        keywords,
        filePath,
      };

      this.agents.set(id, agent);

      // Update division registry
      const divInfo = this.divisions.get(division);
      if (divInfo) {
        divInfo.agentCount++;
        divInfo.agentIds.push(id);
      } else {
        this.divisions.set(division, {
          name: division,
          agentCount: 1,
          agentIds: [id],
        });
      }
    }

    this.loaded = true;
  }

  /** Ensure loader is initialized. */
  private ensureLoaded(): void {
    if (!this.loaded) this.load();
  }

  /**
   * Get an agent by its id (filename without .md extension).
   * Returns null if not found.
   */
  getAgent(id: string): AgentMeta | null {
    this.ensureLoaded();
    return this.agents.get(id) ?? null;
  }

  /**
   * Get an agent with its full Markdown body.
   * The body is loaded on demand to keep startup fast.
   */
  getAgentProfile(id: string): AgentProfile | null {
    this.ensureLoaded();
    const meta = this.agents.get(id);
    if (!meta) return null;

    const content = readFileSync(meta.filePath, "utf-8");
    const parsed = parseFrontMatter(content);
    if (!parsed) return null;

    return { ...meta, body: parsed.body };
  }

  /**
   * Search agents by free-text query.
   * Matches against name, description, division, keywords, and vibe.
   * Returns results sorted by relevance (number of matching terms).
   */
  findAgents(query: string): AgentMeta[] {
    this.ensureLoaded();

    const queryTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (queryTerms.length === 0) return this.listAllAgents();

    const scored: Array<{ agent: AgentMeta; score: number }> = [];

    for (const agent of this.agents.values()) {
      let score = 0;

      for (const term of queryTerms) {
        // Exact name match is highest value
        if (agent.name.toLowerCase().includes(term)) score += 10;
        // Division match
        if (agent.division.includes(term)) score += 5;
        // Keyword match
        if (agent.keywords.some((k) => k.includes(term) || term.includes(k))) score += 3;
        // Description match
        if (agent.description.toLowerCase().includes(term)) score += 2;
        // Vibe match
        if (agent.vibe.toLowerCase().includes(term)) score += 1;
      }

      if (score > 0) {
        scored.push({ agent, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map((s) => s.agent);
  }

  /**
   * Find agents matching specific keywords (exact keyword match).
   * Useful for the orchestrator's routing phase.
   */
  findAgentsByKeywords(keywords: string[]): AgentMeta[] {
    this.ensureLoaded();

    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    const scored: Array<{ agent: AgentMeta; score: number }> = [];

    for (const agent of this.agents.values()) {
      let score = 0;
      for (const keyword of lowerKeywords) {
        if (agent.keywords.includes(keyword)) score++;
        if (agent.name.toLowerCase().includes(keyword)) score += 2;
      }
      if (score > 0) scored.push({ agent, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map((s) => s.agent);
  }

  /**
   * List all agents in a specific division.
   */
  listAgentsByDivision(division: string): AgentMeta[] {
    this.ensureLoaded();
    return [...this.agents.values()].filter((a) => a.division === division);
  }

  /**
   * List all divisions with their agent counts.
   */
  listDivisions(): DivisionInfo[] {
    this.ensureLoaded();
    return [...this.divisions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * List all agents, sorted by division then name.
   */
  listAllAgents(): AgentMeta[] {
    this.ensureLoaded();
    return [...this.agents.values()].sort((a, b) => {
      const divCmp = a.division.localeCompare(b.division);
      if (divCmp !== 0) return divCmp;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get total count of loaded agents.
   */
  get count(): number {
    this.ensureLoaded();
    return this.agents.size;
  }

  /**
   * Get a formatted summary string for display.
   */
  getSummary(): string {
    this.ensureLoaded();
    const lines: string[] = [
      `📊 PhiClaw Agent Registry — ${this.agents.size} agents across ${this.divisions.size} divisions\n`,
    ];

    for (const div of this.listDivisions()) {
      const agents = this.listAgentsByDivision(div.name);
      lines.push(`\n### ${div.name} (${div.agentCount} agents)`);
      for (const agent of agents) {
        lines.push(`  ${agent.emoji} **${agent.name}** — ${agent.vibe || agent.description.slice(0, 80)}`);
      }
    }

    return lines.join("\n");
  }
}

// ─── Default singleton ─────────────────────────────────────

let defaultLoader: AgentLoader | null = null;

/**
 * Get the default AgentLoader singleton.
 * Uses the `agents/` directory relative to the project root.
 */
export function getDefaultAgentLoader(projectRoot?: string): AgentLoader {
  if (!defaultLoader) {
    // Use process.cwd() as primary fallback (resolves to /app in Docker),
    // then try import.meta.dirname (which points to dist/ in bundled builds).
    const root = projectRoot ?? process.cwd();
    defaultLoader = new AgentLoader(join(root, "agents"));
    defaultLoader.load();
  }
  return defaultLoader;
}

/**
 * Create a fresh AgentLoader for a custom agents directory.
 * Does NOT replace the default singleton.
 */
export function createAgentLoader(agentsDir: string): AgentLoader {
  const loader = new AgentLoader(agentsDir);
  loader.load();
  return loader;
}
