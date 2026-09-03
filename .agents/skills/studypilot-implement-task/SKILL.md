---
name: studypilot-implement-task
description: Implement an authorized StudyPilot task within its paths, run relevant checks once, and return concise implementation evidence; route independent review by risk.
---

# Implement Task V2

Read current task, root/applicable module rules and necessary contract sections once. Verify task READY/IN_PROGRESS/RETURNED, writer authority, branch and clean/nonconflicting scope before writing.

- Implement the smallest complete authorized change; preserve product/contract boundaries and other work. New behavior needs tests.
- New security/data/public API impact → ask coordinator to reclassify before proceeding. Worker cannot lower risk.
- Run check_task.py for actual changed paths plus task-specific commands; no install or mutation hidden in checks. Record commands, input fingerprint/SHA, environment, exits and NOT_RUN/FAIL honestly.
- Reuse unchanged valid evidence; rerun affected checks after revision. Self-check the final diff once, no repeated whole-repository survey.
- Return concise result, implementation SHA/paths, test evidence, unresolved risks. Coordinator alone writes task/index. L1/L2 use one TASK record, no separate HANDOFF by default.
- L1: self-check + automated checks then coordinator completion gate; do not call a Reviewer. L2: one independent read-only Review. L3: Review + independent read-only Acceptance.
- Do not self-label independent Review, spawn extra agents or merge. Revisions create a new candidate and require the appropriate updated independent conclusion.

Full shared safeguards and evidence rules live in root AGENTS.md; do not duplicate them in reports.
