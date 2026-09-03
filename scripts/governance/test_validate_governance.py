"""Behavioral and negative tests for V2 governance, not fixed prose wording."""

from __future__ import annotations

import copy
import unittest

from scripts.governance import validate_governance as gov


class GovernanceTests(unittest.TestCase):
    def setUp(self):
        self.policy = gov.load_policy()
        self.text = (gov.ROOT / "docs/tasks/TASK-004-governance-v2.md").read_text()
        self.task = gov.parse_task(self.text)

    def test_repository_structure(self):
        self.assertEqual([], gov.validate())

    def test_risk_routes(self):
        self.assertEqual(("worker",), gov.required_stages("L1"))
        self.assertEqual(("worker", "review"), gov.required_stages("L2"))
        self.assertEqual(("worker", "review", "acceptance"), gov.required_stages("L3"))

    def test_protected_paths_escalate_even_documentation(self):
        for path in (
            "AGENTS.md",
            "backend/AGENTS.md",
            ".codex/agents/x.toml",
            "docs/contracts/api.json",
            "backend/src/models/item.py",
            "docs/governance/guide.md",
            "scripts/governance/check.py",
            "项目需求说明.md",
        ):
            with self.subTest(path=path):
                self.assertEqual("L3", gov.risk_floor([path], ["documentation"], self.policy))

    def test_semantic_flags_override_file_size_or_extension(self):
        for flag in self.policy["high_risk_flags"]:
            self.assertEqual("L3", gov.risk_floor(["readme.md"], [flag], self.policy))
        self.assertEqual("L2", gov.risk_floor(["frontend/src/view.tsx"], ["business"], self.policy))
        self.assertEqual("L1", gov.risk_floor(["docs/help.md"], ["documentation"], self.policy))

    def test_unknown_flags_fail_closed(self):
        for flags in ([], ["typo"], ["documentation", "typo"]):
            with self.assertRaises(ValueError):
                gov.risk_floor(["README.md"], flags, self.policy)

    def test_weakened_policy_rejected(self):
        for risk, field in (("L2", "review"), ("L3", "review"), ("L3", "acceptance")):
            changed = copy.deepcopy(self.policy)
            changed["levels"][risk][field] = False
            self.assertTrue(gov.validate_policy(changed))
        for key, value in (
            ("high_risk_flags", "security"),
            ("high_risk_paths", "docs/contracts/**"),
        ):
            changed = copy.deepcopy(self.policy)
            changed[key].remove(value)
            self.assertTrue(gov.validate_policy(changed))

    def test_exception_cannot_spread(self):
        self.assertEqual(
            ("worker", "review"),
            gov.required_stages("L3", "TASK-004", "V2_USER_REQUEST_2026-09-03"),
        )
        for risk, task_id, value in (
            ("L2", "TASK-004", "V2_USER_REQUEST_2026-09-03"),
            ("L3", "TASK-005", "V2_USER_REQUEST_2026-09-03"),
            ("L3", "TASK-004", "agent-approved"),
        ):
            with self.assertRaises(ValueError):
                gov.required_stages(risk, task_id, value)

    def test_scope_is_bounded(self):
        for path in (
            "",
            "/",
            "../secret",
            "backend/../x",
            "**",
            "back*",
            "backend//x",
            "/tmp/x",
            "backend/./x",
        ):
            self.assertFalse(gov.valid_scope(path), path)
        self.assertTrue(gov.in_scope("backend/src/a.py", ["backend/src/**"]))
        self.assertFalse(gov.in_scope("backend/src-extra/a.py", ["backend/src/**"]))
        self.assertFalse(gov.in_scope("frontend/a.ts", ["backend/src/**"]))

    def test_missing_fields_fail(self):
        for field in (
            "schema_version",
            "id",
            "owner",
            "risk_reason",
            "base",
            "risk_flags",
            "allowed_paths",
            "checks",
        ):
            changed = dict(self.task)
            del changed[field]
            self.assertTrue(gov.validate_task(changed, self.policy), field)

    def test_l3_cannot_be_self_downgraded(self):
        changed = dict(self.task, risk="L1")
        self.assertTrue(gov.validate_task(changed, self.policy))

    def test_invalid_optional_stages_fail(self):
        for risk, status in (("L1", "IN_REVIEW"), ("L2", "IN_ACCEPTANCE")):
            changed = dict(self.task, risk=risk, status=status, risk_flags=["documentation"])
            changed.pop("acceptance_exception")
            self.assertTrue(gov.validate_task(changed, self.policy))

    def test_readonly_roles_cannot_become_writers(self):
        for name in ("qa_reviewer", "integration_owner"):
            data = {
                "name": name,
                "description": "d",
                "developer_instructions": "i",
                "sandbox_mode": "workspace-write",
            }
            self.assertTrue(gov.agent_errors(data))
            data["sandbox_mode"] = "read-only"
            self.assertEqual([], gov.agent_errors(data))

    def test_freeze_ignores_only_status_and_evidence(self):
        changed = self.text.replace('status = "IN_PROGRESS"', 'status = "IN_REVIEW"')
        changed = changed.replace(gov.BEGIN, gov.BEGIN + "\nReview: PASS\n")
        self.assertEqual(gov.frozen_task_text(self.text), gov.frozen_task_text(changed))
        for before, after in (
            ('risk = "L3"', 'risk = "L1"'),
            ('checks = ["governance"]', "checks = []"),
            ("## 完成条件", "## 删除原完成条件"),
        ):
            self.assertNotEqual(
                gov.frozen_task_text(self.text),
                gov.frozen_task_text(self.text.replace(before, after)),
            )

    def test_malformed_evidence_region_rejected(self):
        for text in (self.text.replace(gov.END, ""), self.text + gov.BEGIN):
            with self.assertRaises(ValueError):
                gov.parse_task(text)


if __name__ == "__main__":
    unittest.main()
