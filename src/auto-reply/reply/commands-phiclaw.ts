/**
 * PhiClaw-specific slash commands:
 *  /orchestrate on|off   — toggle the orchestrator
 *  /promptengineer on|off — toggle the prompt engineer
 *  /agents [division]    — list agents (optionally by division)
 *  /agent <name>         — show agent profile
 */

import type { CommandHandler } from "./commands-types.js";
import {
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import {
  getDefaultAgentLoader,
  type AgentMeta,
  type AgentProfile,
  type DivisionInfo,
} from "../../orchestrator/index.js";

// ─── Helpers ───────────────────────────────────────────────

function parseToggleCommand(
  normalized: string,
  prefix: string,
): { match: true; value: "on" | "off" | null } | { match: false } {
  if (
    normalized !== prefix &&
    !normalized.startsWith(`${prefix} `)
  ) {
    return { match: false };
  }
  const rest = normalized.slice(prefix.length).trim().toLowerCase();
  if (rest === "on") return { match: true, value: "on" };
  if (rest === "off") return { match: true, value: "off" };
  if (rest === "") return { match: true, value: null };
  return { match: false };
}

async function toggleConfigSection(
  section: "orchestrator" | "promptEngineer",
  value: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    return { ok: false, error: "Config file is invalid; fix it before toggling." };
  }
  const parsed = structuredClone(snapshot.parsed as Record<string, unknown>);
  const existing = (parsed[section] as Record<string, unknown> | undefined) ?? {};
  parsed[section] = { ...existing, enabled: value };
  const validated = validateConfigObjectWithPlugins(parsed);
  if (!validated.ok) {
    const issue = validated.issues[0];
    return { ok: false, error: `Config invalid after change (${issue?.path}: ${issue?.message}).` };
  }
  await writeConfigFile(validated.config);
  return { ok: true };
}

function formatAgentLine(agent: AgentMeta): string {
  return `${agent.emoji} **${agent.name}** — ${agent.vibe || agent.description.slice(0, 80)}`;
}

function formatDivisionSummary(divisions: DivisionInfo[]): string {
  const total = divisions.reduce((sum, d) => sum + d.agentCount, 0);
  const lines: string[] = [
    `📊 **PhiClaw Agent Registry** — ${total} agents across ${divisions.length} divisions\n`,
  ];
  for (const div of divisions) {
    lines.push(`• **${div.name}** — ${div.agentCount} agents`);
  }
  lines.push(`\n_Use_ \`/agents <division>\` _to list agents in a specific division._`);
  return lines.join("\n");
}

function formatDivisionAgents(division: string, agents: AgentMeta[]): string {
  if (agents.length === 0) {
    return `❌ No division found matching "${division}".\n\nAvailable divisions: ${getDefaultAgentLoader().listDivisions().map((d) => d.name).join(", ")}`;
  }
  const lines: string[] = [
    `📂 **${division}** — ${agents.length} agents\n`,
  ];
  for (const agent of agents) {
    lines.push(`  ${formatAgentLine(agent)}`);
  }
  return lines.join("\n");
}

function formatAgentProfile(profile: AgentProfile): string {
  const lines: string[] = [
    `${profile.emoji} **${profile.name}**`,
    `> ${profile.vibe || profile.description}`,
    "",
    `📂 Division: **${profile.division}**${profile.subDivision ? ` / ${profile.subDivision}` : ""}`,
  ];
  if (profile.tools.length > 0) {
    lines.push(`🛠️ Tools: ${profile.tools.join(", ")}`);
  }
  if (profile.keywords.length > 0) {
    lines.push(`🏷️ Keywords: ${profile.keywords.slice(0, 10).join(", ")}`);
  }
  if (profile.body.trim()) {
    // Show first ~500 chars of body to keep messages manageable
    const bodyPreview = profile.body.trim().slice(0, 500);
    const truncated = profile.body.trim().length > 500 ? "\n\n_…(truncated)_" : "";
    lines.push("", "---", "", bodyPreview + truncated);
  }
  return lines.join("\n");
}

// ─── /orchestrate on|off ───────────────────────────────────

export const handleOrchestrateCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;

  const parsed = parseToggleCommand(params.command.commandBodyNormalized, "/orchestrate");
  if (!parsed.match) return null;

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /orchestrate from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  if (parsed.value === null) {
    const currentState = params.cfg.orchestrator?.enabled !== false;
    return {
      shouldContinue: false,
      reply: {
        text: `🎯 Orchestrator is currently **${currentState ? "ON" : "OFF"}**.\n\nUsage: \`/orchestrate on\` or \`/orchestrate off\``,
      },
    };
  }

  const enabled = parsed.value === "on";
  const result = await toggleConfigSection("orchestrator", enabled);
  if (!result.ok) {
    return {
      shouldContinue: false,
      reply: { text: `⚠️ ${result.error}` },
    };
  }

  return {
    shouldContinue: false,
    reply: {
      text: `🎯 Orchestrator **${enabled ? "ON" : "OFF"}** — configuration updated.`,
    },
  };
};

// ─── /promptengineer on|off ────────────────────────────────

export const handlePromptEngineerCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;

  const parsed = parseToggleCommand(params.command.commandBodyNormalized, "/promptengineer");
  if (!parsed.match) return null;

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /promptengineer from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  if (parsed.value === null) {
    const currentState = params.cfg.promptEngineer?.enabled !== false;
    return {
      shouldContinue: false,
      reply: {
        text: `🧠 Prompt Engineer is currently **${currentState ? "ON" : "OFF"}**.\n\nUsage: \`/promptengineer on\` or \`/promptengineer off\``,
      },
    };
  }

  const enabled = parsed.value === "on";
  const result = await toggleConfigSection("promptEngineer", enabled);
  if (!result.ok) {
    return {
      shouldContinue: false,
      reply: { text: `⚠️ ${result.error}` },
    };
  }

  return {
    shouldContinue: false,
    reply: {
      text: `🧠 Prompt Engineer **${enabled ? "ON" : "OFF"}** — configuration updated.`,
    },
  };
};

// ─── /agents [division] ───────────────────────────────────

export const handleAgentsListCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;

  const norm = params.command.commandBodyNormalized;
  if (norm !== "/agents" && !norm.startsWith("/agents ")) return null;

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /agents from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const loader = getDefaultAgentLoader();
  const arg = norm.slice("/agents".length).trim().toLowerCase();

  if (!arg) {
    // List all divisions
    const divisions = loader.listDivisions();
    return {
      shouldContinue: false,
      reply: { text: formatDivisionSummary(divisions) },
    };
  }

  // List agents in a specific division
  const agents = loader.listAgentsByDivision(arg);
  return {
    shouldContinue: false,
    reply: { text: formatDivisionAgents(arg, agents) },
  };
};

// ─── /agent <name> ─────────────────────────────────────────

export const handleAgentProfileCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;

  const norm = params.command.commandBodyNormalized;
  if (norm !== "/agent" && !norm.startsWith("/agent ")) return null;

  // Avoid conflict with /agents
  if (norm === "/agents" || norm.startsWith("/agents ")) return null;

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /agent from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const query = norm.slice("/agent".length).trim();
  if (!query) {
    return {
      shouldContinue: false,
      reply: { text: "⚠️ Usage: `/agent <name>` — show an agent's detailed profile." },
    };
  }

  const loader = getDefaultAgentLoader();

  // Try exact id match first
  let profile = loader.getAgentProfile(query.toLowerCase());

  // Try search if exact match fails
  if (!profile) {
    const found = loader.findAgents(query);
    if (found.length > 0) {
      profile = loader.getAgentProfile(found[0].id);
    }
  }

  if (!profile) {
    return {
      shouldContinue: false,
      reply: { text: `❌ No agent found matching "${query}".` },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: formatAgentProfile(profile) },
  };
};
