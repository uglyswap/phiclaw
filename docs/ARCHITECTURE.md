# PhiClaw Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    USER INPUT                             │
│  Telegram / WhatsApp / Discord / Webchat / Voice          │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│               PROMPT ENGINEER                             │
│                                                           │
│  Intent Analysis ─── Domain Detection ─── Entity Extract  │
│  Prompt Structuring ─── Agent Suggestion                  │
│                                                           │
│  Mode: LLM-assisted or Rule-based                        │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  ORCHESTRATOR                             │
│                                                           │
│  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐   │
│  │ PLANNER  │→ │ ROUTER │→ │ EXECUTOR │→ │ COMPILER │   │
│  │          │  │        │  │          │  │          │   │
│  │ Decompose│  │ Score  │  │ Run with │  │ Synthesize│   │
│  │ objective│  │ agents │  │ retries  │  │ results  │   │
│  │ into     │  │ per    │  │ parallel │  │ into     │   │
│  │ tasks    │  │ task   │  │ or seq.  │  │ deliverable│  │
│  └──────────┘  └────────┘  └──────────┘  └──────────┘   │
│                                                           │
└─────┬────────────┬────────────┬────────────┬─────────────┘
      │            │            │            │
      ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Agent 1  │ │ Agent 2  │ │ Agent 3  │ │ Agent N  │
│ (SEO)    │ │ (Backend)│ │ (Design) │ │ (...)    │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │            │
     └────────────┴────────────┴────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│               KNOWLEDGE LAYER                             │
│                                                           │
│  ┌──────────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ MEMORY STORE │  │ ONTOLOGY  │  │  AUTO-LEARNING    │  │
│  │              │  │           │  │                   │  │
│  │ Orchestration│  │ Knowledge │  │ Error capture     │  │
│  │ history      │  │ graph     │  │ Success patterns  │  │
│  │ Agent perf.  │  │ Entities  │  │ Agent performance │  │
│  │ Search       │  │ Relations │  │ Recommendations   │  │
│  └──────────────┘  └───────────┘  └───────────────────┘  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Module Descriptions

### Agent Loader (`agent-loader.ts`)
- Parses 156 agent Markdown files with YAML front-matter
- Indexes agents by id, name, division, sub-division, keywords
- Lazy-loads full agent bodies on demand
- Provides search API (free-text, keyword, division)

### Prompt Engineer (`prompt-engineer.ts`)
- Intercepts raw user prompts before orchestration
- Dual-mode: LLM-assisted transformation or rule-based heuristics
- Detects intent (create/analyze/optimize/fix/plan/research)
- Identifies domain and relevant divisions
- Extracts entities (proper nouns, URLs, quoted strings)
- Assesses complexity (simple/moderate/complex)
- Suggests agents based on analysis

### Planner (`planner.ts`)
- Decomposes objectives into ordered task lists
- Generates structured prompts for LLM-based planning
- Parses LLM plan responses with validation and error handling
- Creates fallback plans using keyword-based agent matching
- Manages task dependencies and execution order
- Formats plans for human-readable display

### Router (`router.ts`)
- Multi-signal agent scoring algorithm:
  - Division keyword matching (domain affinity)
  - Agent keyword matching (specificity)
  - Name matching (exact and partial)
  - Description overlap
- Division-level routing with comprehensive keyword maps
- Alternative agent suggestions
- Works without LLM — pure algorithmic routing

### Executor (`executor.ts`)
- Executes plans with three strategies:
  - **Sequential**: tasks one-by-one
  - **Parallel**: independent tasks concurrently (wave-based)
  - **Mixed**: parallel waves respecting dependency ordering
- Retry logic with exponential backoff
- Task timeout enforcement
- Event emission for progress tracking
- Context threading (completed task results passed to later tasks)
- Pluggable LLM caller interface

### Compiler (`compiler.ts`)
- Aggregates task results into unified deliverables
- Simple mode: structured concatenation with status indicators
- Intelligent mode: LLM-powered synthesis into cohesive document
- Execution summary with metrics table
- Chat-friendly formatting with truncation

### Memory Store (`memory.ts`)
- Persistent orchestration history
- Agent performance tracking (success rates, durations)
- Searchable orchestration archive
- Auto-generated learnings from failures
- JSON file persistence

### Ontology (`ontology.ts`)
- Typed knowledge graph (Entity + Relation)
- Entity types: Agent, Division, Task, Orchestration, Skill, Project, Learning, Custom
- Relation types: belongs_to, depends_on, executed_by, produced, learned_from, related_to, part_of, uses, created_by
- BFS path-finding between entities
- Subgraph extraction (N-hop neighborhoods)
- Append-only JSONL persistence with compaction

### Auto-Learning (`auto-learning.ts`)
- Learns from task failures (error context, agent involvement)
- Learns from task successes (reusable patterns)
- User correction capture
- Agent performance tracking
- Pattern detection (degradation alerts)
- Agent recommendations based on historical data
- Task pattern matching for smart routing

## Data Flow

1. **Input** → User sends objective via any channel
2. **Prompt Engineering** → Raw prompt transformed to structured prompt
3. **Planning** → Structured prompt decomposed into task graph
4. **Routing** → Each task matched to best agent(s)
5. **Execution** → Tasks executed with agent profiles as context
6. **Compilation** → Results synthesized into deliverable
7. **Learning** → Results recorded, patterns extracted, metrics updated
8. **Output** → Compiled deliverable returned to user

## File Structure

```
phiclaw/
├── agents/                    # 156 agent profiles (Markdown + YAML)
│   ├── academic/              # 5 agents
│   ├── design/                # 8 agents
│   ├── engineering/           # 23 agents
│   ├── game-development/      # 20 agents
│   ├── marketing/             # 27 agents
│   ├── paid-media/            # 7 agents
│   ├── product/               # 5 agents
│   ├── project-management/    # 6 agents
│   ├── sales/                 # 8 agents
│   ├── spatial-computing/     # 6 agents
│   ├── specialized/           # 27 agents
│   ├── strategy/              # Playbooks & runbooks
│   ├── support/               # 6 agents
│   └── testing/               # 8 agents
├── src/
│   └── orchestrator/          # PhiClaw orchestration engine
│       ├── index.ts           # Main Orchestrator class + re-exports
│       ├── types.ts           # Shared type definitions
│       ├── agent-loader.ts    # Agent file parser and indexer
│       ├── prompt-engineer.ts # Prompt transformation module
│       ├── planner.ts         # Objective-to-task decomposition
│       ├── router.ts          # Task-to-agent routing
│       ├── executor.ts        # Plan execution engine
│       ├── compiler.ts        # Result synthesis
│       ├── memory.ts          # Orchestration memory store
│       ├── ontology.ts        # Knowledge graph
│       └── auto-learning.ts   # Continuous improvement engine
├── docs/
│   ├── GUIDE.md              # User guide
│   └── ARCHITECTURE.md       # This file
├── AGENTS.md                  # Agent registry listing
├── README.md                  # Project overview
├── phiclaw.config.json        # Default configuration
└── package.json               # Project metadata
```
