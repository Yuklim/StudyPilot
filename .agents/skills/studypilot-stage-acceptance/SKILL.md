---
name: studypilot-stage-acceptance
description: Decide whether a StudyPilot task has enough requirement, implementation, test, review, and handoff evidence to proceed to user merge approval. Use after independent review; do not implement features or automatically merge.
---

# StudyPilot Stage Acceptance

Make an evidence-based gate decision after implementation and independent review.

## Required evidence

- Approved task brief.
- Frozen candidate commit SHA and complete actual merge diff.
- Developer handoff.
- Independent review report.
- Required test and check results.
- Approved contract or documentation changes, if any.

Missing material evidence prevents `PASS`.

## Workflow

1. Read the root `AGENTS.md`, task, relevant requirements, contracts, handoff, and review.
2. Verify the actual runtime is `read-only`; if it cannot be confirmed, return `BLOCKED`.
3. Confirm the reviewed candidate SHA still identifies the complete implementation/configuration diff being accepted. Compare it with the current evidence HEAD and allow only the exact same-task `REVIEW`, `ACCEPTANCE`, task/index status fields, and decision-log entries.
4. Map every acceptance condition to concrete evidence.
5. Confirm all changed paths were authorized.
6. Confirm review findings are fixed, explicitly accepted by an authorized decision-maker, or recorded as blockers.
7. Confirm validation claims contain real commands and results.
8. Check unresolved security, privacy, compatibility, data-loss, and scope risks.
9. Produce an acceptance report using `docs/governance/templates/STAGE_ACCEPTANCE_TEMPLATE.md` and return it to the `coordinator` for persistence and state update.

## Decisions

Return exactly one gate decision:

- `PASS`: every required condition has evidence and no blocking risk remains;
- `RETURN`: the original implementation owner must revise the change;
- `BLOCKED`: a missing decision, permission, dependency, or external condition prevents completion.

## Boundaries

- Do not implement missing functionality during acceptance.
- Do not modify files, create commits, resolve integration conflicts, cherry-pick, rebase, or otherwise change the candidate.
- If a conflict or any post-review change affects HANDOFF, task goal, scope, allowed paths, acceptance conditions, code, tests, configuration, contracts, or governance rules, return `RETURN`; the original implementation owner must create a new SHA and a complete independent review must run again. Acceptance-report persistence itself is the narrow evidence exception and does not require accepting itself.
- Do not rewrite requirements or contracts to make the change pass.
- Do not hide failed checks or unresolved findings.
- Do not merge automatically. `PASS` only means the change may be presented to the user for final approval.
- Do not directly mutate shared task state unless acting as the coordinator under the control-plane exception.
