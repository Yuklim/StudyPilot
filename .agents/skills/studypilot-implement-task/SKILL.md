---
name: studypilot-implement-task
description: Implement one READY StudyPilot task within its assigned paths, validate the change, commit it on the task branch, and produce a handoff. Use only for an authorized implementation task; do not use for intake, independent review, or acceptance.
---

# StudyPilot Implement Task

Complete one authorized task without crossing its responsibility or file boundary.

## Entry gate

Before writing:

1. Read the root and applicable nested `AGENTS.md` files.
2. Read the complete task file, relevant requirements, approved contracts, and decisions.
3. Confirm the task status is `READY` or `IN_PROGRESS` and that the current role matches the assigned owner.
4. Run `git status --short --branch` and confirm the branch/worktree matches the task.
5. Confirm allowed paths do not overlap another active write task.

If any check fails, remain read-only and report the blocker.

## Implementation

1. Inspect the affected code and tests before editing.
2. Identify the smallest coherent change that satisfies every acceptance condition.
3. Change only allowed paths.
4. Preserve approved contracts and unrelated user or Agent changes.
5. Add or update tests for changed behavior when the project has an established test mechanism.
6. Update only documentation directly affected by the behavior and authorized by the task.
7. Do not fix unrelated failures or refactor unrelated code.

## Self-validation

1. Review the full task diff, not only the last file changed.
2. Check every changed path against the task allowlist.
3. Run every required check exactly as documented.
4. Record commands and real results. Never claim an unrun check passed.
5. If a check cannot run, record why and the resulting risk.
6. Verify no secret, local environment file, or unrelated change entered the diff.

## Git and handoff

1. Commit only task-owned files using the repository commit convention.
2. Do not merge, force-push, or rewrite shared history.
3. Produce a handoff using `docs/governance/templates/HANDOFF_TEMPLATE.md` and return it to the `coordinator`.
4. Do not directly edit the shared task status, task index, review report, or acceptance report. The coordinator persists evidence and advances state.

Do not review or approve your own work. The next step is an independent read-only review.
