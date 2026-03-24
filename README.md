# PhiClaw (Φ)

> **The Golden Ratio of Agentic AI** — An intelligent orchestrator powered by 144+ specialized agents.

PhiClaw is a fork of [OpenClaw](https://github.com/openclaw/openclaw) enriched with a multi-agent orchestration engine integrating **144 specialized agents** from [The Agency](https://github.com/msitarzewski/agency-agents).

Give PhiClaw a business objective — it mobilizes an entire team of specialists to achieve it.

---

## ✨ Features

- **144+ Specialized Agents** across 14 divisions (Engineering, Marketing, Design, Sales, Product, and more)
- **Intelligent Orchestrator** — decomposes objectives into tasks, routes to the best agents, executes in parallel or sequence, compiles deliverables
- **Agent Loader** — parses agent profiles from Markdown with YAML front-matter, indexes by name/division/keywords
- **Prompt Engineer** — transforms raw user prompts into structured, optimized orchestration requests
- **Memory & Knowledge** — QMD 2 vector memory (baked-in via Bun), ontology knowledge graph, auto-learning from past orchestrations
- **Multi-Channel** — Telegram, WhatsApp, Discord, Webchat, Voice (TTS/STT)
- **🎤 Native Voice Transcription** — Local Whisper (faster-whisper) speech-to-text, free, no API key needed
- **🔊 Native Text-to-Speech** — Edge TTS (Microsoft), free, multilingual, high quality voices
- **TypeScript Strict** — production-grade, fully typed codebase

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  INTERFACE                       │
│  Telegram / WhatsApp / Discord / Webchat / Voice │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│           PROMPT ENGINEER                        │
│  Transforms raw prompt → optimized prompt        │
│  Identifies intent and required agents           │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│            ORCHESTRATOR                          │
│  Planner → Router → Executor → Compiler          │
│  Manages task dependencies & parallel execution  │
└───────┬───────┬───────┬───────┬─────────────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──────┐
   │ Agent │ │Agent │ │Agent│ │Agent  │
   │ SEO   │ │Back  │ │UX   │ │Growth │
   │       │ │end   │ │     │ │Hacker │
   └───────┘ └──────┘ └─────┘ └───────┘
        │       │       │       │
┌───────▼───────▼───────▼───────▼─────────────────┐
│              MEMORY & KNOWLEDGE                  │
│  QMD 2 (vector) + Ontology (graph)               │
│  Auto-learning + Orchestration history           │
└─────────────────────────────────────────────────┘
```

## 📂 Agent Divisions

| Division | Agents | Focus |
|---|---|---|
| Academic | 5 | Research, history, anthropology, geography, psychology |
| Design | 8 | UI/UX, brand, visual storytelling, accessibility |
| Engineering | 23 | Backend, frontend, mobile, DevOps, security, AI, blockchain |
| Game Development | 20 | Unity, Unreal, Godot, Roblox, Blender, audio, narrative |
| Marketing | 27 | SEO, social media, growth hacking, content, e-commerce |
| Paid Media | 7 | PPC, programmatic, social ads, tracking, creative |
| Product | 5 | Product management, feedback, prioritization, trends |
| Project Management | 6 | Sprints, Jira, experiment tracking, studio ops |
| Sales | 8 | Pipeline, outbound, discovery, proposals, coaching |
| Spatial Computing | 6 | VisionOS, XR, Metal, spatial interfaces |
| Specialized | 27 | Compliance, blockchain, recruitment, consulting, MCP |
| Strategy | 3 | Nexus strategy, coordination, playbooks |
| Support | 6 | Analytics, finance, legal, infrastructure, customer support |
| Testing | 8 | API, accessibility, performance, workflow optimization |

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/uglyswap/phiclaw.git
cd phiclaw

# Install
npm install

# Configure (add your API keys)
cp .env.example .env

# Run
npm start
```

## 🎯 Usage

### Orchestrate a Business Objective
```
/orchestrate Launch proprietaire.net in the French market

→ PhiClaw creates a plan:
  1. Product Manager → Market analysis & positioning
  2. SEO Specialist → SEO audit + recommendations
  3. Growth Hacker → 3-channel acquisition strategy
  4. Content Writer → 5 SEO-optimized blog articles
  5. Social Media Manager → 1-month social calendar
  6. Sales Engineer → Product demo script
  7. Project Manager → Timeline & milestones
```

### Other Commands
```
/agents              — List all available agents
/agents engineering  — List agents in a division
/agent seo           — Activate a specific agent
/plan <objective>    — Generate a plan without executing
/status              — Check orchestration status
```

## ⚙️ Configuration

Add to your `openclaw.json`:

```json
{
  "orchestrator": {
    "enabled": true,
    "maxConcurrentTasks": 4,
    "defaultModel": "anthropic/claude-opus-4-6",
    "planBeforeExecute": true
  },
  "agents": {
    "directory": "./agents",
    "enabledDivisions": ["all"],
    "customAgentsDirectory": "./custom-agents"
  },
  "promptEngineer": {
    "enabled": true
  }
}
```

## 🎤 Audio & Voice Support

PhiClaw ships with **native audio support** out of the box — no external API keys required.

### Speech-to-Text (Transcription)
- Powered by **faster-whisper** (CTranslate2 Whisper implementation)
- Runs locally on CPU with INT8 quantization — fast and free
- Whisper "small" model (~500MB, downloaded automatically on first use)
- Supports all Whisper-compatible languages

### Text-to-Speech (TTS)
- Powered by **Edge TTS** (Microsoft Edge's neural voices)
- Free, no API key needed
- Default voice: `fr-FR-VivienneMultilingualNeural` (configurable)
- Supports 300+ voices across 100+ languages

### First-Run Setup
After deploying PhiClaw, run the audio setup to download the Whisper model:
```bash
docker exec -it phiclaw /app/scripts/setup-audio.sh
```

### Configuration
Audio settings are in `phiclaw.config.json`:
```json
{
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "models": [{ "type": "cli", "command": "/app/scripts/transcribe.sh" }]
      }
    }
  },
  "messages": {
    "tts": {
      "provider": "edge",
      "edge": { "voice": "fr-FR-VivienneMultilingualNeural" }
    }
  }
}
```

## 🧠 QMD 2 — Vector Memory

PhiClaw ships with **QMD 2** (Vector Memory) baked directly into the Docker image. No runtime installation needed.

### How It Works
- **Bun** installs `@tobilu/qmd` at build time, ensuring `better-sqlite3` native bindings are always correct
- The QMD database persists in the volume at `~/.openclaw/workspace/.cache/qmd/`
- Collections index your `memory/` directory and workspace `*.md` files

### Scripts
| Script | Purpose |
|--------|---------|
| `/app/scripts/qmd-wrapper.sh` | QMD CLI wrapper (use this to invoke QMD) |
| `/app/scripts/setup-qmd.sh` | Initialize collections on first launch |
| `/app/scripts/check-qmd.sh` | Health check + auto-repair `better-sqlite3` |

### First-Run Setup
```bash
docker exec -it phiclaw /app/scripts/setup-qmd.sh
```

### Check Health
```bash
docker exec phiclaw /app/scripts/check-qmd.sh
```

## 🕸️ Ontology — Knowledge Graph

PhiClaw includes a **typed knowledge graph** for structured agent memory. Entities (Person, Project, Task, Event, Document...) are linked via relations and validated against a schema.

- Storage: `memory/ontology/graph.jsonl`
- Schema: `memory/ontology/schema.yaml`
- Script: `python3 /app/skills/ontology/scripts/ontology.py`

See `skills/ontology/SKILL.md` for full documentation.

## 🔄 Auto-Updater

PhiClaw includes a **production-grade auto-updater** that syncs with upstream OpenClaw, rebuilds, and redeploys — with automatic rollback on failure.

### What It Does
1. Checks and installs Docker BuildKit if needed
2. Fetches upstream `openclaw/openclaw` main branch
3. Merges upstream changes with **automatic conflict resolution** (protects PhiClaw-specific files)
4. Pushes the merge to GitHub
5. Rebuilds the Docker image (tags old image as `phiclaw:rollback`)
6. Redeploys the container with the new image
7. Validates: gateway health, Telegram connection, QMD, agents
8. Rolls back automatically if any critical step fails

### Protected Files (never overwritten by upstream)
- `agents/` — our 172+ specialized agents
- `src/orchestrator/` — our orchestration engine
- `src/auto-reply/reply/commands-phiclaw.ts` — custom commands
- `phiclaw.config.json` — our configuration
- `scripts/` — all PhiClaw scripts (entrypoint, audio, QMD, updater)
- `skills/ontology/` — knowledge graph skill
- `README.md` — this file

### Usage
```bash
# Run from the HOST (requires Docker access)
cd /tmp/phiclaw
./scripts/update-phiclaw.sh

# Force rebuild even if already up to date
./scripts/update-phiclaw.sh --force

# Dry run (simulate without changes)
./scripts/update-phiclaw.sh --dry-run

# With webhook notification
PHICLAW_NOTIFY_WEBHOOK="https://hooks.example.com/update" ./scripts/update-phiclaw.sh --notify
```

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PHICLAW_REPO_DIR` | `/tmp/phiclaw` | Path to the PhiClaw repo |
| `PHICLAW_IMAGE` | `phiclaw:local` | Docker image name |
| `PHICLAW_CONTAINER` | `phiclaw` | Docker container name |
| `PHICLAW_HOST_PORT` | `18800` | Host port mapping |
| `PHICLAW_CONTAINER_PORT` | `18789` | Container port |
| `PHICLAW_HEALTH_TIMEOUT` | `120` | Gateway health check timeout (seconds) |
| `PHICLAW_NOTIFY_WEBHOOK` | _(empty)_ | Webhook URL for notifications |

### Automated Updates (Cron)
```bash
# Daily at 4 AM
0 4 * * * /tmp/phiclaw/scripts/update-phiclaw.sh >> /var/log/phiclaw-update.log 2>&1
```

## 📜 License

MIT — Same as OpenClaw and The Agency.

## 🙏 Credits

- [OpenClaw](https://github.com/openclaw/openclaw) — The foundational AI agent platform
- [The Agency](https://github.com/msitarzewski/agency-agents) — 144 specialized agent profiles by Matt Sitarzewski
- Built with Φ (phi) — the golden ratio of intelligent orchestration

---

_PhiClaw — Give it an objective, get back results._
