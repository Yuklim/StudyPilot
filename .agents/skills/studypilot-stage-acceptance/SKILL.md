---
name: studypilot-stage-acceptance
description: Decide whether a StudyPilot task has enough requirement, implementation, test, review, and handoff evidence to proceed to user merge approval. Use after independent review; do not implement features or automatically merge.
---

# StudyPilot Stage Acceptance

Make an evidence-based gate decision after implementation and independent review.

## Required evidence

- Approved task brief.
- Complete actual merge diff.
- Developer handoff.
- Independent review report.
- Required test and check results.
- Approved contract or documentation changes, if any.

Missing material evidence prevents `PASS`.

## Workflow

1. Read the root `AGENTS.md`, task, relevant requirements, contracts, handoff, and review.
2. Map every acceptance condition to concrete evidence.
3. Confirm all changed paths were authorized.
4. Confirm review findings are fixed, explicitly accepted by an authorized decision-maker, or recorded as blockers.
5. Confirm validation claims contain real commands and results.
6. Check unresolved security, privacy, compatibility, data-loss, and scope risks.
7. Produce an acceptance report using `docs/governance/templates/STAGE_ACCEPTANCE_TEMPLATE.md` and return it to the `coordinator` for persistence and state update.

## Decisions

Return exactly one gate decision:

- `PASS`: every required condition has evidence and no blocking risk remains;
- `RETURN`: the original implementation owner must revise the change;
- `BLOCKED`: a missing decision, permission, dependency, or external condition prevents completion.

## Boundaries

- Do not implement missing functionality during acceptance.
- Do not rewrite requirements or contracts to make the change pass.
- Do not hide failed checks or unresolved findings.
- Do not merge automatically. `PASS` only means the change may be presented to the user for final approval.
- Do not directly mutate shared task state unless acting as the coordinator under the control-plane exception.
