# PhiClaw User Guide

## What is PhiClaw?

PhiClaw is an AI agent orchestration platform built on OpenClaw. It adds:

- **156 specialized agents** across 14 divisions (engineering, marketing, design, sales, etc.)
- **Intelligent orchestrator** that decomposes objectives into tasks and assigns the best agents
- **Prompt engineer** that optimizes your prompts before orchestration
- **Memory system** that learns from past orchestrations
- **Knowledge graph** (ontology) for structured relationships between entities

## Getting Started

### Installation

```bash
git clone https://github.com/uglyswap/phiclaw.git
cd phiclaw
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

### Configuration

PhiClaw is configured via `phiclaw.config.json` in the project root:

```json
{
  "orchestrator": {
    "enabled": true,
    "maxConcurrentTasks": 4,
    "defaultModel": "anthropic/claude-sonnet-4-20250514",
    "planBeforeExecute": true,
    "maxTasksPerPlan": 10
  },
  "agents": {
    "directory": "./agents",
    "enabledDivisions": ["all"]
  },
  "promptEngineer": {
    "enabled": true,
    "useLLM": true
  }
}
```

## Usage

### Orchestrate a Multi-Agent Task

The core command is `/orchestrate`. Give it a business objective and PhiClaw handles the rest:

```
/orchestrate Launch proprietaire.net in the French market
```

PhiClaw will:
1. **Engineer the prompt** — clarify intent, structure deliverables
2. **Create a plan** — decompose into 3-10 concrete tasks
3. **Route tasks** — assign the best agent(s) to each task
4. **Execute** — run tasks (sequential, parallel, or mixed)
5. **Compile** — synthesize all outputs into a unified deliverable
6. **Learn** — record what worked and what didn't

### Preview a Plan (Dry Run)

```
/plan Create a comprehensive marketing strategy for a B2B SaaS
```

This generates the plan without executing it, so you can review and adjust.

### Browse Agents

```
/agents                    — List all 14 divisions with agent counts
/agents engineering        — List all 23 engineering agents
/agents marketing          — List all 27 marketing agents
/agent marketing-seo-specialist  — Activate a specific agent
```

### Check Status

```
/status     — View current orchestration progress
```

## How Orchestration Works

### 1. Prompt Engineering

Your raw prompt is analyzed for:
- **Intent** — what action are you asking for? (create, analyze, optimize, fix, plan, research)
- **Domain** — which business area? (engineering, marketing, design, product, etc.)
- **Entities** — what specific things are mentioned? (company names, URLs, technologies)
- **Complexity** — simple (single agent), moderate (2-3 agents), or complex (full orchestration)

### 2. Planning

The planner decomposes your objective into discrete tasks:

```
Objective: "Launch my SaaS in the French market"

Plan:
  task-1: Market analysis & competitive positioning  (Product Manager)
  task-2: SEO audit + keyword research               (SEO Specialist)
  task-3: Growth strategy — 3 acquisition channels    (Growth Hacker)
  task-4: Content plan — 5 blog articles              (Content Creator)
  task-5: Social media calendar — 1 month             (Social Media Strategist)
  task-6: Sales pitch deck + demo script              (Sales Engineer)
  task-7: Project timeline + milestones               (Senior Project Manager)
```

### 3. Routing

Each task is routed to the best agent(s) using multi-signal scoring:
- **Keyword matching** — agent keywords vs task description
- **Division affinity** — task domain vs agent division
- **Name similarity** — direct name matches score highest
- **Historical performance** — agents with proven success records score higher

### 4. Execution

Three execution modes:
- **Sequential** — tasks run one after another (for dependent workflows)
- **Parallel** — independent tasks run simultaneously (up to `maxConcurrentTasks`)
- **Mixed** — parallel waves with sequential ordering between dependent groups

Each task includes:
- The assigned agent's full personality and expertise
- Context from previously completed tasks
- The specific task prompt with deliverable expectations

Failed tasks are retried with exponential backoff (up to `maxRetriesPerTask`).

### 5. Compilation

All task outputs are compiled into a unified deliverable:
- **Simple mode** — structured concatenation with status indicators
- **Intelligent mode** — LLM synthesizes outputs into a cohesive document

### 6. Learning

After each orchestration:
- Results are saved to memory for future reference
- Failed tasks generate learnings (what went wrong, which agents, what error)
- Successful patterns are recorded (which agents work well for which tasks)
- Agent performance metrics are updated (success rates, average durations)

## Memory & Knowledge

### Memory Store

PhiClaw remembers past orchestrations. Query your history:

```
Search past orchestrations by objective or agent
View agent performance metrics (success rate, speed)
Get recommendations based on historical data
```

### Ontology (Knowledge Graph)

PhiClaw maintains a knowledge graph connecting:
- **Agents** → Divisions they belong to
- **Tasks** → Agents that executed them
- **Orchestrations** → Tasks they contained
- **Learnings** → Errors they stemmed from

### Auto-Learning

The system continuously improves by:
- Recording task failures with full context
- Identifying successful agent-task patterns
- Tracking agent performance over time
- Detecting degradation trends (high failure rates)
- Surfacing recommendations for future orchestrations

## Agent Divisions

| Division | Count | Specialization |
|---|---|---|
| Academic | 5 | Research, analysis, theory |
| Design | 8 | UI/UX, brand, accessibility |
| Engineering | 23 | Code, architecture, DevOps, security |
| Game Development | 20 | Unity, Unreal, Godot, Roblox |
| Marketing | 27 | SEO, social media, growth, content |
| Paid Media | 7 | PPC, programmatic, tracking |
| Product | 5 | Product management, feedback, trends |
| Project Management | 6 | Agile, Jira, production |
| Sales | 8 | Pipeline, outbound, proposals |
| Spatial Computing | 6 | VR/AR/XR, VisionOS |
| Specialized | 27 | Compliance, blockchain, recruiting |
| Strategy | — | Playbooks, runbooks, coordination |
| Support | 6 | Analytics, finance, legal, infra |
| Testing | 8 | QA, performance, accessibility |

## Custom Agents

You can create custom agents by adding Markdown files to `./custom-agents/`:

```markdown
---
name: My Custom Agent
description: A specialized agent for my specific needs
color: purple
emoji: 🦄
vibe: Does exactly what I need, every time
---

# My Custom Agent

## Identity
You are **My Custom Agent**...

## Core Mission
...

## Critical Rules
...

## Deliverables
...
```

## Programmatic API

```typescript
import { Orchestrator, createAgentLoader } from "./src/orchestrator/index.js";

// Create loader and orchestrator
const loader = createAgentLoader("./agents");
const orchestrator = new Orchestrator(loader, myLLMCaller);

// Full orchestration
const result = await orchestrator.orchestrate("Build a landing page");

// Dry-run plan
const plan = await orchestrator.plan("Launch marketing campaign");

// Search agents
const agents = orchestrator.findAgents("SEO");

// Route a query
const route = orchestrator.routeQuery("optimize database queries");

// Engineer a prompt
const engineered = await orchestrator.engineerPrompt("make my site faster");

// Get memory
const memory = orchestrator.getMemory();
const history = memory.getRecentOrchestrations(5);

// Get learnings
const learning = orchestrator.getAutoLearning();
const stats = learning.getStats();
```

---

_PhiClaw (Φ) — The Golden Ratio of Agentic AI_
