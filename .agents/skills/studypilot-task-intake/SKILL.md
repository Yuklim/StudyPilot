---
name: studypilot-task-intake
description: Create or audit a StudyPilot development task brief before any implementation starts. Use when work needs to be scoped, assigned, or checked for write authorization; do not use to implement the task.
---

# StudyPilot Task Intake

Turn one confirmed product or engineering objective into a bounded, reviewable task file. This workflow is executed by the `coordinator` under explicit user authorization and uses the root `AGENTS.md` control-plane exception.

## Required inputs

- The requested outcome.
- The confirmed requirement or approved decision that authorizes it.
- The intended owner role.

## Workflow

1. Read the root `AGENTS.md`, applicable product requirements, and `docs/governance/角色与模块边界.md`.
2. Inspect existing files and active task briefs without modifying product or source files.
3. Choose a unique `TASK-XXX` identifier. Never reuse an existing identifier.
4. Create or audit the task using `docs/governance/templates/TASK_TEMPLATE.md`.
5. Define observable goals and explicit non-goals.
6. List exact allowed paths and forbidden paths. Do not use a repository-wide wildcard for an implementation task.
7. Record dependencies, acceptance conditions, required checks, review requirements, and handoff requirements.
8. Check whether the task can run independently. If it overlaps another active task or depends on an unapproved contract, mark it `BLOCKED` or `DRAFT`.
9. On `agent/coordinator/<task-id>-intake`, reserve the task number and allowed paths in `docs/tasks/任务索引.md` before parallel work is dispatched.
10. Set status to `READY` only when every authorization field is complete and no material decision is missing.
11. Ask the user to merge the READY task and registry update into the stable shared `main` baseline before a development worktree is created. Never commit the control plane directly on `main`.

## Boundaries

- Do not choose a technology, framework, data model, or interface unless an approved decision already exists.
- Do not edit implementation files.
- Do not use the control-plane exception for product, architecture, configuration, or source changes.
- Do not treat suggestions as confirmed requirements.
- Do not broaden the task to make implementation easier.
- When missing information would materially change the outcome, leave the task non-ready and report the exact decision needed.

## Output

Return:

- task file path;
- status (`READY`, `DRAFT`, or `BLOCKED`);
- owner role;
- allowed paths;
- unresolved decisions;
- whether the task is safe to run in parallel.
