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
- **Memory & Knowledge** — QMD 2 vector memory, ontology knowledge graph, auto-learning from past orchestrations
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

## 📜 License

MIT — Same as OpenClaw and The Agency.

## 🙏 Credits

- [OpenClaw](https://github.com/openclaw/openclaw) — The foundational AI agent platform
- [The Agency](https://github.com/msitarzewski/agency-agents) — 144 specialized agent profiles by Matt Sitarzewski
- Built with Φ (phi) — the golden ratio of intelligent orchestration

---

_PhiClaw — Give it an objective, get back results._
