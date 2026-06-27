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

The `--cv` and `--job` inputs accept **Markdown/plain text, PDF, or Word (`.docx`)**;
text is extracted automatically based on the file extension.

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

## History (saved applications)

Every run is saved to a local SQLite database (`.data/career-agent.db` by default,
override with `CAREER_DB_PATH`) so you can browse and re-open past results without
re-calling a model. Pass `--no-db` to skip saving a run.

```bash
pnpm dev --list        # list recent runs with their grounding/honesty scores
pnpm dev --show 3      # re-render saved application #3 as Markdown
```

Each record stores the inputs (CV + job text), the full pack, and the headline
grounding scores — the persistence layer the planned web app will build on.

## Grounding audit (deterministic)

The "never invent experience" guarantee is **verified mechanically**, not just
asked of the model. After a pack is assembled, every cited evidence string is
checked against the raw CV with plain substring/token matching — no model in the
loop, so it can't be talked around. Each claim is classified as:

- **grounded** — the evidence is a (normalized) substring of the CV;
- **partial** — enough token overlap to be a paraphrase of real CV content;
- **no-evidence** — the honest `no direct evidence found` sentinel;
- **ungrounded** — little/no overlap, i.e. likely invented.

Two headline scores are printed in the CLI summary, embedded in the Markdown
report, and stored on `pack.grounding` in the JSON:

- **Grounding score** — of claims that *assert* evidence, the share backed by the
  CV (partial counts as half).
- **Honesty score** — the share of claims that are not fabricated. This is the
  provable form of the headline promise.

The check is also a **hard gate** inside the Phase 5 collaboration loop: the
supervisor will not approve tailored bullets while any bullet cites evidence that
isn't in the CV, and the deterministic list of ungrounded bullets is fed back to
the writer for revision — so the loop provably converges toward grounded output.

## Configuration

Set in `.env` (see `.env.example`):

- `OLLAMA_MODEL` — model name (default `qwen3:8b`)
- `OLLAMA_BASE_URL` — Ollama server URL (default `http://127.0.0.1:11434`)
- `OLLAMA_TEMPERATURE` — sampling temperature (default `0.2`)
- `OLLAMA_SEED` — optional fixed sampling seed for reproducible runs (unset by default)
- `PERF` — set to `1` to log each LLM call's duration + token usage as it finishes
- `OLLAMA_MODEL_<ROLE>` — optional per-role model override (see below)
- `CAREER_DB_PATH` — SQLite history database path (default `.data/career-agent.db`)

On startup the CLI runs a **preflight check**: if Ollama is unreachable or a
required model (including any per-role models) isn't pulled, it exits with an
actionable message instead of failing mid-run.

### Per-role models

Each LLM call declares a logical role, so you can route cheap, mechanical work to
a small model and reserve a stronger model for generative/critical work. Set
`OLLAMA_MODEL_<ROLE>` (each falls back to `OLLAMA_MODEL` when unset, preserving
the single-model default). Roles: `ROUTING`, `PLANNING`, `ANALYSIS`, `WRITING`,
`CRITIQUE`, `SYNTHESIS`.

```bash
# Small model for routing/planning; larger model for writing & critique.
OLLAMA_MODEL_WRITING=qwen3:14b
OLLAMA_MODEL_CRITIQUE=qwen3:14b
```

Every run prints a performance summary (wall time, number of LLM calls, total
in-model time, **token usage**, and a per-call breakdown). Token counts come from
Ollama's reported prompt/eval counts. Set `PERF=1` for live per-call timings:

```bash
PERF=1 pnpm dev --cv ./data/cv.sample.md --job ./data/job-description.sample.md --mode full
```

### Parallel execution

Some steps are independent and run concurrently:

- **Phase 1:** gap analysis, CV tailoring, and interview prep all depend only on
  the match analysis, so they fan out in parallel after it.
- **Phase 5:** the critic and the evidence verifier both read the current draft
  and run in parallel, joining at the supervisor's review.

The remaining order is forced by data dependencies (`job_analysis → match_analysis`,
and the synthesizer runs last). When `wall time < in-model time` in the summary,
that gap is the parallel speedup.

Real overlap requires Ollama to serve concurrent requests. If you don't see a
speedup, start the server with a higher parallelism, e.g.:

```bash
OLLAMA_NUM_PARALLEL=3 ollama serve
```

Note the speedup is sublinear: concurrent requests share the GPU, so each
individual call gets slower even as total wall time drops.

## Tests

Fast, deterministic tests run with no model required:

- **Unit tests** for the pure logic: plan topological sort / normalization, task
  scheduling, supervisor worker-eligibility, Phase 2 routing predicates, bullet
  dedup, the Markdown renderer, the grounding verifier, and eval scoring.
- **Graph-wiring tests** that exercise the real compiled LangGraph graphs end to
  end with a canned LLM stub (`src/testing/canned-llm.ts`), asserting which
  sections each mode/phase produces. These use the node:test module mocker
  (`--experimental-test-module-mocks`, already wired into the `test` script).

```bash
pnpm test         # node:test runner via tsx
pnpm typecheck
```

## Evals

The evals harness runs the orchestrator end-to-end against the live model and
scores each run for **grounding rate**, **no-evidence honesty**, **completeness**,
and **latency**, across phases and models. (This calls Ollama and is slow; the
pure scoring logic is unit-tested separately.)

Runs are reproducible by default: the harness sets `temperature 0` and a fixed
`seed`, both overridable via flags.

```bash
pnpm eval                     # default: phase 2, all fixtures, temp 0 + seed 42
pnpm eval --phases 1,3,4      # compare orchestration phases
pnpm eval --model qwen3:14b   # override the model
pnpm eval --fixture honesty   # only fixtures whose id contains "honesty"
pnpm eval --seed 7 --temperature 0.4   # override sampling
```

Fixtures live in `src/evals/fixtures.ts` and include an honesty stress test (a CV
with none of the job's skills, which must report missing matches rather than
invent experience). A JSON report is written to `outputs/evals-<timestamp>.json`.

## Project structure

```
src/
  index.ts                 # CLI entrypoint (arg parsing, file IO, presentation)
  core/
    orchestrator.ts        # CLI-agnostic facade: run a phase -> graded pack + events
  llm/
    ollama.ts              # configurable ChatOllama factory + model preflight
    structured.ts          # structured-output helper with retry + token capture
  schemas/
    application.ts         # Zod schemas for every section of the pack (+ grounding report)
  tools/
    read-file.ts           # plain-text file reading (plain fn + LangChain tool)
    read-document.ts       # CV/job text extraction from Markdown, PDF, and .docx
    write-artifact.ts      # artifact writing (plain fn + LangChain tool)
  store/
    db.ts                  # SQLite connection + schema (better-sqlite3)
    applications.ts        # save/list/get saved application runs
  agents/                  # one focused, grounded agent per analysis step
  graphs/
    phase1-single-agent.ts # Phase 1: sequential pipeline
    phase2-router.ts       # Phase 2: LangGraph graph + router + conditional edges
    phase3-plan-execute.ts # Phase 3: planner -> executor loop -> evaluator (retry once)
    phase4-supervisor-workers.ts # Phase 4: supervisor delegates to specialist workers
    phase5-collaboration.ts # Phase 5: writer/critic/verifier revision loop
    pack.ts                # shared helper to assemble a pack from graph state
  grounding/
    verify.ts              # deterministic grounding verifier (substring/token checks)
  evals/
    fixtures.ts            # CV + job eval fixtures (incl. an honesty stress test)
    scoring.ts             # pure scoring: grounding, honesty, completeness, latency
    run-evals.ts           # `pnpm eval` runner (live model, writes a JSON report)
  render/
    pack-markdown.ts       # render a pack as a Markdown report
  testing/
    canned-llm.ts          # model-free callStructured stub for graph-wiring tests
  **/*.test.ts             # node:test unit + graph-wiring tests
data/                      # sample CV + job description
outputs/                   # generated packs + eval reports (gitignored)
```

## Roadmap

This project is built in incremental, working milestones:

- **Phase 1 (done):** sequential pipeline of structured LLM calls + CLI.
- **Phase 2 (done):** LangGraph.js graph with state, nodes, and a router that picks the mode.
- **Phase 3 (done):** plan-and-execute loop (planner → executor → evaluator with one retry).
- **Phase 4 (done):** supervisor agent delegating to specialist worker agents (incl. a critic).
- **Phase 5 (done):** multi-agent collaboration (writer ↔ critic ↔ evidence verifier loop).

**Quality & tooling (done):**

- Deterministic grounding verifier with provable grounding/honesty scores, used
  as a hard gate in the Phase 5 revision loop.
- Evals harness (reproducible by default) scoring grounding, honesty,
  completeness, and latency across phases.
- Unit tests + graph-wiring tests (real graphs, canned LLM).
- Per-role model configuration; bullet dedup; token metrics; model preflight;
  prompt-injection hardening.
- CLI-agnostic `core/` orchestration layer (shared by the CLI and evals; ready
  for an HTTP API).

**Web-app readiness (in progress):**

- Multi-format input (Markdown / PDF / `.docx`) extracted to text.
- SQLite-backed history of saved applications (`--list` / `--show`).
- Next: an HTTP API over the `core/` layer, then a web UI.
