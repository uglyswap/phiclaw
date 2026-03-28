#!/usr/bin/env node
/**
 * patch-bootstrap-limit.cjs
 * Ensures agents.defaults.bootstrapMaxChars >= 30000 in openclaw.json
 * so that the PhiClaw AGENTS.md (~25KB) is not truncated.
 */
const fs = require("fs");
const configPath = process.argv[2] || `${process.env.HOME}/.openclaw/openclaw.json`;

try {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const current = cfg?.agents?.defaults?.bootstrapMaxChars || 20000;
  if (current < 30000) {
    if (!cfg.agents) cfg.agents = {};
    if (!cfg.agents.defaults) cfg.agents.defaults = {};
    cfg.agents.defaults.bootstrapMaxChars = 30000;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`[phiclaw] Set bootstrapMaxChars=30000 (was ${current})`);
  } else {
    console.log(`[phiclaw] bootstrapMaxChars already ${current}, OK`);
  }
} catch (e) {
  console.log(`[phiclaw] Config patch skipped: ${e.message}`);
}
