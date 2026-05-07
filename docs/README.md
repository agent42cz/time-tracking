# Documentation index

This tree describes the **AS IS** state of the system — what is true today on the merged codebase. It is updated when features ship, not when tasks begin. For TO BE specs and in-flight work, see [`../tasks/`](../tasks/).

## Layout

| Folder / file                        | Purpose                                                                                  | Audience                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------- |
| [`constitution.md`](constitution.md) | Non-negotiable rules: tech-stack lock, testing discipline, deployment invariants         | LLMs + humans              |
| [`architecture/`](architecture/)     | How the system is built — apps, packages, data flow, real-time topology                  | LLMs + developers          |
| [`reference/`](reference/)           | Functional reference: data model, feature catalogue (US-1..50), acceptance map, env vars | Developers + LLMs          |
| [`operations/`](operations/)         | How to run, deploy to Coolify, monitor, troubleshoot                                     | DevOps + on-call           |
| [`business/`](business/)             | Why the project exists, users, goals, non-goals                                          | Stakeholders + LLM context |
| [`decisions/`](decisions/)           | Architecture Decision Records — append-only, supersede with new ADRs                     | LLMs + historians          |
| [`gotchas.md`](gotchas.md)           | Append-only log of 20-minute-surprise bugs/integrations and their fixes                  | LLM learning               |
| [`modules/`](modules/)               | Optional per-module docs for projects past `~50 docs / ~30 src folders`. Not used today. | Modular projects only      |

## How this differs from `tasks/`

- **`docs/`** is overwritten as the system evolves — there is no history dimension; only the present matters.
- **`tasks/`** is append-only — once merged, a task folder becomes a frozen historical record (assignment, plan, changelog). Never edit a merged task.

If something is true now, it lives in `docs/`. If something _was_ planned and then shipped, the planning evidence lives in `tasks/`.

## How agents use this tree

Read [`../CLAUDE.md`](../CLAUDE.md) first. It points at `constitution.md`, `architecture/`, `operations/`, and `decisions/` as the four required reads before any non-trivial change.
