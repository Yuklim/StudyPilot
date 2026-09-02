---
name: studypilot-task-intake
description: Scope and risk-classify one authorized StudyPilot task before writing; create or audit its single task record, not implementation.
---

# Task Intake V2

Use current root rules, task, applicable module rules and only linked requirement/contract sections. Reuse already-read unchanged context; no full repository or history scan.

1. Confirm user authorization, unique task ID, one writer, base, goal/non-goals, dependencies, exact allowlist, observable completion conditions and checks.
2. Classify L1/L2/L3 by impact using docs/governance/风险分级与检查规则.md. Record flags and reason; take highest risk, escalate uncertainty, never split to evade review.
3. Use TASK_TEMPLATE.md: one record, plus serial index registration. A normal task branch includes intake, implementation and evidence; no mandatory intake merge or closeout PR. Unapproved dependencies still block.
4. READY only when required decisions and boundaries are complete. Main agent may be the authorized Worker. Dispatch only when independent value exceeds coordination cost; one shared-directory writer.
5. Pass a small context packet: task + rules versions + relevant files/contract sections + checks + expected output. Do not copy all background.

Return task/risk/writer, unresolved decisions and whether safe to proceed. Missing authority → DRAFT/BLOCKED; no guessed requirements.
