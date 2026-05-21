# Multi-Agent Orchestration — Roadmap

Status snapshot of where the orchestration layer is, what's deferred, and
the conditions that should trigger building each next tier. Updated as
we ship.

## Where we are today

**Tier 1 — Synthesis-back handoffs.** Shipped.

PM can delegate a sub-task to a specialist and ask for the findings to be
handed back for cross-domain synthesis. Mechanism:

- `handoff_to_analyst` / `handoff_to_designer` now take optional `return_to="pm"`.
- `handoff_to_pm` now takes `intent="synthesize"` + `findings` for the return trip.
- Specialist prompts know to check the payload and route accordingly.
- PM prompt knows what to do when resumed for synthesis (lead with answer,
  weave findings, cite both, don't re-search).
- `MAX_HANDOFFS` bumped 3 → 5 to allow PM → A → PM → D → PM chains.

Sufficient for ~80% of multi-domain queries we expect. The remaining 20%
are why Tier 2 and Tier 3 exist.

---

## Tier 2 — Supervisor / Planner Step

### Problem this solves

Tier 1 still relies on the starting agent (almost always PM) to *realise*
mid-thought that it needs a specialist, then make a handoff. That works
for "interview + numbers" but breaks down when:

- The user's question genuinely needs **three or more** specialist hops
  (e.g. "interviews + perf data + competitive landscape + landing page").
- The router picks the **wrong starting agent** for a multi-domain query
  (e.g. user opens with "show me churn numbers", router picks Analyst,
  but the real ask was "explain why churn is up and what to do" — Analyst
  doesn't know to involve PM).
- Two specialists are needed but neither is the obvious lead, so the
  reactive handoff pattern stalls.

### Design

Insert a *planner LLM call* between the router and the agent loop. It
emits a structured plan — orchestrator runs the plan instead of relying
on reactive handoffs.

```
user message
    │
    ▼
classifier  ←── existing cheap router decides "is this multi-step?"
    │
    ├── single-step? → existing reactive path (Tier 1)
    │
    └── multi-step?  → planner LLM emits:
                       { "steps": [
                         {"agent": "pm",      "task": "extract checkout pain
                                                      points from interviews"},
                         {"agent": "analyst", "task": "checkout funnel drop-off
                                                      by step in perf.csv"},
                         {"agent": "pm",      "task": "synthesize: pain point
                                                      + numbers + recommendation"}
                       ]}
                       ↓
                       orchestrator runs steps sequentially, threading
                       each step's output into the next step's payload
```

The planner is itself a cheap LLM call (gemini-2.5-flash-lite, same model
as the router). Output a JSON list of `{agent, task}`. No reactive
handoffs needed within a planned run — the plan IS the handoff chain.

### Where the planner fits in the existing code

- New file: `backend/agent/planner.py` — `async def plan(message, history) -> list[Step] | None`.
  Returns `None` if the classifier decides "single-step, use Tier 1".
- `orchestrator.py:run_orchestrated`:
  - After the existing `_route()` call, ask the planner.
  - If a plan exists, run a new `_run_planned()` path instead of the
    reactive `while True:` loop. Each step in the plan invokes the
    relevant agent with the prior step's output threaded into
    `handoff_payload`.
  - If no plan, fall through to the existing reactive path.
- `agents/*.py` system prompts mostly unchanged — the planner gives each
  specialist a focused task so the agent's local behavior is the same.

### Effort estimate

~2 hours. Single new file + ~80 lines in `orchestrator.py`. No tool
schema changes. No agent prompt changes beyond a one-line note that "when
you receive a planned task, focus narrowly on it — synthesis is someone
else's job".

### Signals it's time to build Tier 2

Watch the logs. Build Tier 2 when:

1. **Routing misses are common.** Grep `Orchestrator start` log lines for
   sessions where the user's next message contradicted the chosen agent
   (e.g. user re-asked the question with clearer intent). If >10% of
   multi-domain sessions miss-route, Tier 2 will close the gap.
2. **Handoff chains hit MAX_HANDOFFS = 5.** Each cap-hit means a
   reactive chain exceeded what we'd planned for. >2/week is the signal.
3. **Specialists are caught in loops.** If `agent_start` events show
   ping-pong (PM → Analyst → PM → Analyst → PM) on the same turn,
   reactive handoffs aren't enough — explicit planning will fix it.

If none of those happen, Tier 2 is unnecessary complexity. Don't pre-build.

---

## Tier 3 — Parallel DAG Execution

### Problem this solves

Tier 1 and Tier 2 are both strictly sequential. For a question like:

> "Compare what the interviews say, what the support tickets say, what the
>  perf numbers say, and what last month's NPS responses say about checkout"

Four independent specialist subtasks are run one at a time. At ~5-8s per
turn, that's 25-30s of latency for a query that could be done in ~10s if
the four ran in parallel.

### Design

Generalize Tier 2's plan from a list to a DAG:

```python
{
  "nodes": [
    {"id": "a", "agent": "pm",      "task": "extract pain points from interviews"},
    {"id": "b", "agent": "pm",      "task": "extract pain points from support tickets"},
    {"id": "c", "agent": "analyst", "task": "perf funnel drop-off"},
    {"id": "d", "agent": "analyst", "task": "NPS sentiment delta MoM"},
    {"id": "e", "agent": "pm",      "task": "synthesise across a, b, c, d",
                "depends_on": ["a", "b", "c", "d"]}
  ]
}
```

Orchestrator runs nodes whose dependencies are met in parallel via
`asyncio.gather`, fans in results into the synthesis node's payload.

### What's actually hard about this

1. **Shared canonical_msgs.** Today every sub-agent mutates the same
   `canonical_msgs` list in place. Parallel nodes can't share a single
   message log — each branch needs its own forked history, then a merge
   step. That's the bulk of the work.

2. **Streaming UX.** The frontend's `CursorChat.tsx` assumes one
   linear SSE stream. Four parallel `agent_start` events would currently
   render as a confusing pile of mixed tool calls. Either:
   - (a) buffer the parallel results and emit them in deterministic order
         after fan-in, OR
   - (b) extend the frontend to render parallel "lanes" — visible columns
         per agent. (b) is cooler but a much bigger lift.

3. **Permission gates in parallel branches.** What if two parallel
   branches both hit `create_doc`? Frontend would need to surface both
   permission prompts at once. Decide whether parallel branches can
   touch write tools or are read-only.

### Effort estimate

4-8 hours backend + 2-4 hours frontend (option (a)) or 1-2 days (option (b)).

### Signals it's time to build Tier 3

- **Latency complaints.** Users say "the multi-step queries are slow."
  Look at the p50 wall-clock time for sessions with 3+ `agent_start` events.
  When that exceeds 20s, parallelism becomes worth it.
- **Independent subtasks dominate.** When grepping plans (Tier 2),
  observe how often the DAG would be a chain vs. a star (one synthesis
  node fanning in from many independent leaves). Star-shaped plans
  benefit from parallelism; chains don't.
- **Frontend is ready for parallel rendering.** Without (b) above, the
  user-visible improvement from Tier 3 is just "this got faster." That's
  a real win — but cheaper to communicate as latency optimisation than as
  a UX feature.

If latency is fine and the dominant pattern is sequential, skip Tier 3.

---

## Side note: Designer-initiated multi-domain

Tier 1 handles **PM-initiated** multi-domain queries. The symmetric case
— user opens with a designer-domain request that *also* needs PM work —
isn't covered:

> "build a launch page AND write the announcement post for it"

Router picks Designer (`build a launch page` wins). Designer renders the
page, then... nothing. Designer doesn't think to delegate the copy work
back to PM.

**Cheapest fix (~15 min):**

Add a `MULTI-DOMAIN` block to `designer.py` that mirrors the PM one:

> If the user's request includes work outside design (copy, research, doc
> creation), after rendering call:
>   `handoff_to_pm(query="<the non-design part>", intent="research", return_to="designer")`
> The PM will do that work and hand back.

Defer until a real user reports this gap. Designer-initiated multi-domain
requests are statistically rarer than PM-initiated ones — users tend to
phrase compound asks PM-first ("research X and then design Y") because
research feels like the precondition.

---

## Quick decision matrix

| If you observe... | Build... |
|---|---|
| Tier 1 misses >10% of multi-domain queries | Tier 2 (planner) |
| Multi-domain queries feel slow (>20s p50) | Tier 3 (parallel) |
| Users open with design + copy compound asks | Designer-initiated fix |
| Single-agent queries are 90%+ of traffic | **Don't build any of these.** Reactive Tier 1 is sufficient. |

Resist building these speculatively. Each adds complexity to a system
that's currently easy to debug. Wait for evidence.
