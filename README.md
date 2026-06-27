# Career Agent Orchestrator

A local-first CLI that turns a **CV** + a **job description** into a grounded
**application pack**. It's a portfolio project for learning TypeScript agentic
patterns with **LangGraph.js**, **LangChain.js**, and **Ollama** running local
open-source models.

> **Grounding guarantee:** the system never invents experience. Every
> recommendation either cites evidence from the CV or says exactly
> `no direct evidence found`.

The application pack contains:

1. Job requirements breakdown
2. CV-to-job match analysis
3. Missing skills / gap analysis
4. Tailored CV bullet suggestions
5. Interview preparation questions
6. Final application strategy brief

## Requirements

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- [Ollama](https://ollama.com/) running locally with a model pulled:

```bash
ollama pull qwen3:8b     # default, comfortable on ~36GB RAM
ollama pull qwen3:14b    # optional quality upgrade
```

## Setup

```bash
pnpm install
cp .env.example .env      # then edit if needed
```

## Usage

```bash
pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md --mode full
```

Modes:

| Mode            | Produces                                                        |
| --------------- | -------------------------------------------------------------- |
| `job-analysis`  | Requirements breakdown only                                   |
| `cv-tailoring`  | + match, gap analysis, tailored CV bullets                    |
| `interview-prep`| + match, interview questions                                  |
| `full`          | Everything + final strategy brief (default)                  |

Instead of `--mode`, you can describe what you want in natural language and let
the Phase 2 router pick the mode:

```bash
pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md \
  --request "help me get ready for the interview"
```

Choose the orchestration version with `--phase` (default `2`):

- `--phase 1` — plain sequential pipeline
- `--phase 2` — LangGraph graph with a router + conditional edges
- `--phase 3` — plan-and-execute loop (planner → executor → evaluator, one retry)
- `--phase 4` — supervisor delegates to specialist workers (incl. a critic)
- `--phase 5` — collaboration loop (writer → critic → evidence verifier → revise → approve)

Override the model per run without editing `.env`:

```bash
pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md --model qwen3:14b
```

Generated artifacts (JSON + Markdown) are written to `outputs/`.

## Configuration

Set in `.env` (see `.env.example`):

- `OLLAMA_MODEL` — model name (default `qwen3:8b`)
- `OLLAMA_BASE_URL` — Ollama server URL (default `http://127.0.0.1:11434`)
- `OLLAMA_TEMPERATURE` — sampling temperature (default `0.2`)

## Project structure

```
src/
  index.ts                 # CLI entrypoint (arg parsing, file IO, orchestration)
  llm/
    ollama.ts              # configurable ChatOllama factory
    structured.ts          # structured-output helper with retry + error handling
  schemas/
    application.ts         # Zod schemas for every section of the pack
  tools/
    read-file.ts           # file reading (plain fn + LangChain tool)
    write-artifact.ts      # artifact writing (plain fn + LangChain tool)
  agents/                  # one focused, grounded agent per analysis step
  graphs/
    phase1-single-agent.ts # Phase 1: sequential pipeline
    phase2-router.ts       # Phase 2: LangGraph graph + router + conditional edges
    phase3-plan-execute.ts # Phase 3: planner -> executor loop -> evaluator (retry once)
    phase4-supervisor-workers.ts # Phase 4: supervisor delegates to specialist workers
    phase5-collaboration.ts # Phase 5: writer/critic/verifier revision loop
    pack.ts                # shared helper to assemble a pack from graph state
  render/
    pack-markdown.ts       # render a pack as a Markdown report
data/                      # sample CV + job description
outputs/                   # generated packs (gitignored)
```

## Roadmap

This project is built in incremental, working milestones:

- **Phase 1 (done):** sequential pipeline of structured LLM calls + CLI.
- **Phase 2 (done):** LangGraph.js graph with state, nodes, and a router that picks the mode.
- **Phase 3 (done):** plan-and-execute loop (planner → executor → evaluator with one retry).
- **Phase 4 (done):** supervisor agent delegating to specialist worker agents (incl. a critic).
- **Phase 5 (done):** multi-agent collaboration (writer ↔ critic ↔ evidence verifier loop).
