#!/usr/bin/env node
/**
 * generate-agents-catalog.cjs
 *
 * Reads all agent Markdown files from agents/ directory,
 * extracts YAML front-matter, and generates AGENTS.md — a workspace
 * bootstrap file that includes orchestration instructions + full agent catalog.
 *
 * Usage:
 *   node scripts/generate-agents-catalog.cjs [output-path]
 *   node scripts/generate-agents-catalog.cjs > AGENTS.md
 */

const fs = require("fs");
const path = require("path");

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const AGENTS_DIR = path.resolve(__dirname, "..", "agents");

function findMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (
      entry.name.endsWith(".md") &&
      !["README.md", "CONTRIBUTING.md", "EXECUTIVE-BRIEF.md", "QUICKSTART.md"].includes(entry.name)
    ) {
      results.push(full);
    }
  }
  return results;
}

function parseYamlSimple(text) {
  const result = {};
  for (const line of text.split("\n")) {
    const m =
      line.match(/^(\w+):\s*"(.+)"\s*$/) ||
      line.match(/^(\w+):\s*'(.+)'\s*$/) ||
      line.match(/^(\w+):\s*(.+?)\s*$/);
    if (m && m[1] && m[2]) {
      result[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return result;
}

function formatDivisionName(div) {
  return div
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildCatalog() {
  const files = findMarkdownFiles(AGENTS_DIR).sort();
  const divisions = {};
  let total = 0;

  for (const fp of files) {
    const content = fs.readFileSync(fp, "utf-8");
    const m = content.match(FRONT_MATTER_RE);
    if (!m) continue;
    const meta = parseYamlSimple(m[1]);
    if (!meta.name) continue;

    const rel = path.relative(AGENTS_DIR, fp);
    const parts = rel.split(path.sep);
    const division = parts[0];
    const id = path.basename(fp, ".md");

    if (!divisions[division]) divisions[division] = [];
    divisions[division].push({
      id,
      name: meta.name,
      emoji: meta.emoji || "🤖",
      vibe: meta.vibe || (meta.description || "").slice(0, 100),
    });
    total++;
  }

  // ── Header: Orchestration Protocol ──
  const lines = [];
  lines.push("# AGENTS.md — PhiClaw Multi-Agent Orchestration");
  lines.push("");
  lines.push(`> **${total} specialized agents** across **${Object.keys(divisions).length} divisions** — powered by PhiClaw`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 🎯 Two-Stage Pipeline: Prompt Architect → Orchestrator");
  lines.push("");
  lines.push("Every user message goes through a **mandatory 2-stage pipeline**:");
  lines.push("");
  lines.push("### Stage 1: 🧠 Prompt Architect");
  lines.push("Transform the user's raw input into an expert-level prompt.");
  lines.push("");
  lines.push("**Process:**");
  lines.push("1. **Analyze** the user's intent (create/analyze/optimize/fix/plan/research)");
  lines.push("2. **Identify** all domains involved and their interdependencies");
  lines.push("3. **Expand** with: specific requirements, edge cases, quality criteria, constraints, deliverable format");
  lines.push("4. **Structure** into a comprehensive technical brief");
  lines.push("");
  lines.push("**Output:** Display the enhanced prompt in a collapsible block:");
  lines.push("```");
  lines.push("<details>");
  lines.push("<summary>📝 Enhanced Prompt (by Prompt Architect)</summary>");
  lines.push("");
  lines.push("[The full enhanced prompt goes here — this is what the orchestrator will work from]");
  lines.push("");
  lines.push("</details>");
  lines.push("```");
  lines.push("");
  lines.push("### Stage 2: 🎯 Orchestrator");
  lines.push("Take the enhanced prompt from Stage 1 and orchestrate the response.");
  lines.push("");
  lines.push("**Process:**");
  lines.push("1. **Route** — Select 1-5 agents from the registry below whose expertise matches the enhanced prompt");
  lines.push("2. **Plan** — Break the enhanced prompt into sub-tasks, one per agent");
  lines.push("3. **Execute** — For each agent: read its full profile from `agents/<division>/<id>.md`, apply its methodology");
  lines.push("4. **Compile** — Synthesize all agent outputs into a unified, high-quality response");
  lines.push("");
  lines.push("**Output format:**");
  lines.push("```");
  lines.push("🎯 Orchestration: [agent-1, agent-2, agent-3]");
  lines.push("");
  lines.push("[Response content with agent expertise applied]");
  lines.push("");
  lines.push("_(per 🏗️ Agent Name)_ for each section");
  lines.push("```");
  lines.push("");
  lines.push("### Rules");
  lines.push("- **ALWAYS** show the enhanced prompt block (Stage 1 output) — the user must see what was generated");
  lines.push("- **ALWAYS** list the selected agents at the start of the response");
  lines.push("- **ALWAYS** cite which agent contributed to each section");
  lines.push("- For simple questions (greetings, yes/no), skip the pipeline and answer directly");
  lines.push("- Read the full `.md` profile of each selected agent from `agents/<division>/<id>.md` before composing");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Agent Registry ──
  lines.push("## 📂 Agent Registry");
  lines.push("");

  for (const div of Object.keys(divisions).sort()) {
    const agents = divisions[div];
    lines.push(`### ${formatDivisionName(div)} (${agents.length})`);
    lines.push("");
    for (const a of agents) {
      lines.push(`- ${a.emoji} **${a.name}** (\`${a.id}\`) — ${a.vibe}`);
    }
    lines.push("");
  }

  // ── Commands ──
  lines.push("---");
  lines.push("");
  lines.push("## 🛠️ Commands");
  lines.push("");
  lines.push("| Command | Description |");
  lines.push("|---|---|");
  lines.push("| `/phiagents` | List all divisions with agent counts |");
  lines.push("| `/phiagents <division>` | List agents in a specific division |");
  lines.push("| `/phiagent <name>` | Show full agent profile |");
  lines.push("| `/orchestrate on\\|off` | Toggle orchestrator |");
  lines.push("| `/promptengineer on\\|off` | Toggle prompt engineer |");
  lines.push("");

  // ── Strategy ──
  lines.push("## 📋 Strategy & Playbooks");
  lines.push("");
  lines.push("For complex multi-phase projects, consult `agents/strategy/`:");
  lines.push("- **NEXUS** — Multi-agent orchestration playbook");
  lines.push("- **Phases 0-6** — Discovery → Strategy → Foundation → Build → Hardening → Launch → Operate");
  lines.push("- **Runbooks** — Startup MVP, Enterprise Feature, Incident Response, Marketing Campaign");

  return lines.join("\n");
}

// Main
const catalog = buildCatalog();
const outputPath = process.argv[2];

if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, catalog + "\n", "utf-8");
  console.log(`[generate-agents-catalog] Written ${catalog.length} bytes to ${outputPath}`);
} else {
  process.stdout.write(catalog + "\n");
}
