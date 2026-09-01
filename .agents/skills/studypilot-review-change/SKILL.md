---
name: studypilot-review-change
description: Perform a read-only, defect-first review of a StudyPilot task change against its requirements, scope, contracts, and evidence. Use after implementation or when a review is explicitly requested; never edit, commit, or merge.
---

# StudyPilot Review Change

Inspect the change as an independent Reviewer and return actionable findings.

## Read-only boundary

At the start, verify the actual runtime permission is read-only. A custom Agent default may be overridden by the parent task's live permission. If read-only cannot be confirmed, return `BLOCKED`.

Do not modify files, create commits, push, merge, reformat, fix findings, or delegate write work.

## Required inputs

- Task file.
- Comparison base and frozen candidate commit SHA, which must include the handoff.
- Applicable requirements and contracts.
- Developer handoff and validation evidence.

If the actual merge diff cannot be identified, report `BLOCKED` instead of reviewing an arbitrary diff.

## Review workflow

1. Read applicable `AGENTS.md` files and the complete task.
2. Resolve the actual merge base, verify the frozen candidate SHA, then inspect its complete merge diff and enough surrounding code to understand each path.
3. Confirm every changed file is authorized by the task.
4. Trace affected behavior and relevant call sites.
5. Check acceptance conditions, tests, validation claims, contracts, security, privacy, error behavior, and likely regressions.
6. Continue through the entire diff after finding the first issue.

## Finding threshold

Report a finding only when it is:

- introduced by the reviewed change;
- concrete and actionable;
- supported by code, requirement, contract, or test evidence;
- meaningful for correctness, security, privacy, performance, maintainability, or scope compliance;
- something the author would reasonably fix.

Do not report speculative concerns, pre-existing problems, intentional approved changes, or style-only issues handled mechanically.

## Output

Use `docs/governance/templates/REVIEW_TEMPLATE.md`.

- Findings come first and are ordered `P0` to `P3`.
- Cite the smallest relevant path and line.
- State the violated rule, triggering scenario, impact, and safe correction path.
- If there are no qualifying findings, write `No findings.`
- End with test gaps, residual risks, and one conclusion: `READY_FOR_ACCEPTANCE`, `CHANGES_REQUIRED`, or `BLOCKED`.
- Return the completed report to the `coordinator`; the coordinator persists `docs/tasks/TASK-XXX-REVIEW.md` and advances shared state.
- Any post-review change outside the exact evidence-writeback allowlist creates a new candidate SHA, invalidates the old report, and requires a new read-only review of the complete merge diff.
