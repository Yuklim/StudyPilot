---
name: studypilot-review-change
description: Independently review a StudyPilot L2/L3 final diff in an actual read-only runtime; omit for normal L1 work.
---

# Review Change V2

Verify actual runtime permission is read-only, independent of the implementer; otherwise BLOCKED. No edits, commits, pushes, merging, fixes or delegation.

Inputs: task, base/candidate SHAs, relevant rules/contract sections, compact implementation/test evidence. Reuse unchanged already-read rules; do not read unrelated project history.

- First review: verify frozen candidate/merge base, then complete base..candidate diff and necessary call sites; check scope, semantics, security, privacy and test coverage.
- Revision: inspect previous_candidate..candidate and affected context; explicitly inherit prior unchanged coverage and conclude on the new final candidate. Baseline/risk/design change, missing old evidence or unclear impact → full review.
- Reuse trustworthy mechanical test evidence bound to inputs; only rerun targeted checks for a concrete gap or suspicious claim. Format/lint are not manual review tasks.
- Report only introduced, actionable defects with path/line, trigger, impact and safe fix. Continue across the assigned scope; do not invent findings to justify calling a Reviewer.
- Apply the practical-risk section of docs/governance/风险分级与检查规则.md: assess confirmed usage, evidence/likelihood, impact and repair/maintenance cost; separate blockers, non-blocking issues and optional suggestions. Do not reject for theoretical completeness, unpromised scale or preference. PASS may retain explicitly disclosed non-blocking issues; safety, required checks and approved requirements/contracts cannot be waived for cost.
- Return concise candidate/base/runtime proof, findings or No findings, coverage/gaps and PASS / CHANGES_REQUIRED / BLOCKED. Coordinator persists in TASK EVIDENCE; L3 large/legacy reports may use REVIEW_TEMPLATE.md.
- PASS routes L2 to coordinator summary; L3 to independent Acceptance. Any changed implementation/authorization needs updated candidate coverage, not reuse of an old SHA conclusion as-is.
