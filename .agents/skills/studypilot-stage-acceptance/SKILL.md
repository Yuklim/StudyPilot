---
name: studypilot-stage-acceptance
description: Verify L3 completion evidence after independent Review in a separate actual read-only runtime; do not run a separate acceptance agent for L1/L2.
---

# Stage Acceptance V2

Only L3, after Review PASS. Confirm actual read-only runtime and independence from both implementer and Reviewer; otherwise BLOCKED. No implementation, writes, commits, conflict resolution, cherry-pick, rebase, merge or delegation.

Use task completion conditions, candidate and Review, compact checks/handoff and relevant integration/contract evidence. Do not reread the whole repository or repeat Review of the entire codebase.
Verify candidate still matches Review and later changes are only narrow evidence writeback. Map each completion condition to real evidence; reuse Worker results tied to tested input. Only add minimal necessary cross-module validation when missing, not a blanket rerun.
Check unresolved findings, privacy/data-loss/compatibility risks and explicit user decisions. No forged PASS or hidden NOT_RUN.

Return candidate/runtime proof, condition→evidence gaps, risks and PASS / RETURN / BLOCKED. Coordinator records in TASK EVIDENCE, or optional L3/legacy appendix. No recursive acceptance of evidence persistence itself.
L1/L2 coordinator closure is not independent Acceptance and must be labeled N/A. TASK-004 has an explicit one-time user exception described in root rules; do not generalize it.
