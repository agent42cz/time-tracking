# Tasks

This tree holds **TO BE** specifications and historical task records. It is the inverse of [`../docs/`](../docs/), which describes the **AS IS** state of the system.

## Layout

```
tasks/
├── README.md                       # this file
└── <EPIC-KEY>/
    └── <TASK-KEY>/
        ├── assignment.md           # what & why (the spec)
        ├── plan.md                 # how (implementation plan)
        └── changelog.md            # what was actually delivered
```

## Naming

- **Epic key:** UPPERCASE, stable, short. Examples: `AUTH`, `INVOICING`, `RATE-LIMIT`, `SIDEBAR`.
- **Task key:** epic + zero-padded number. Examples: `AUTH-01`, `SIDEBAR-01`, `INVOICING-03`.

## File contents

### `assignment.md` — what & why

- One-line summary.
- The problem in plain language.
- Acceptance criteria as a checklist.
- Out-of-scope items — bound the work.
- Dependencies on other tasks.

### `plan.md` — how

- Step-by-step implementation plan.
- Files to be created / modified.
- Tests to be added.
- Any spec deviations and why.

### `changelog.md` — what shipped

- Final outcome summary.
- Files created / modified (paths).
- Tests added (count + names).
- Commits (hash + subject).
- Any deviations from the plan.

## Lifecycle

1. **Open** — `assignment.md` exists, `plan.md` may be in progress, `changelog.md` is empty.
2. **In flight** — `plan.md` is the active checklist.
3. **Merged** — `changelog.md` is filled in. **The folder becomes frozen** — no further edits, ever. If the work needs follow-up, open a new task.

The point of freezing merged tasks is that the folder becomes a faithful historical record. Re-litigating plans after merge erases the evidence of how decisions actually played out.

## Where AS IS docs go

When a task ships a new behavior, the corresponding update to [`../docs/`](../docs/) lives there, not in the task folder. The task folder only records what happened during the task; the docs folder reflects the resulting system state.
