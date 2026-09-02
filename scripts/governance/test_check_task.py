"""Mechanical check regression cases; no external service or secret fixtures."""

from __future__ import annotations

import copy
import subprocess
import unittest
from unittest.mock import patch

from scripts.governance import check_task as check
from scripts.governance import validate_governance as gov


class CheckTests(unittest.TestCase):
    def test_profiles_cannot_be_omitted_by_task(self):
        self.assertEqual({"backend"}, check.selected_profiles(["backend/src/main.py"], []))
        self.assertEqual({"frontend"}, check.selected_profiles(["frontend/src/a.tsx"], []))
        self.assertEqual({"governance"}, check.selected_profiles(["AGENTS.md"], []))
        self.assertEqual({"contracts"}, check.selected_profiles(["docs/contracts/api.json"], []))
        self.assertEqual(set(), check.selected_profiles(["docs/help.md"], []))
        with self.assertRaises(ValueError):
            check.selected_profiles([], ["skip-all"])

    def test_secrets_report_no_value(self):
        token = "sk-" + "x" * 30
        findings = check.secret_findings("example.py", token)
        self.assertTrue(findings)
        self.assertNotIn(token, "\n".join(findings))
        self.assertTrue(check.secret_findings(".env.local", ""))
        self.assertEqual([], check.secret_findings(".env.example", "API_KEY=<your-key>"))

    def test_openapi_structure_and_negative_cases(self):
        doc = {
            "openapi": "3.1.0",
            "info": {},
            "paths": {"/x": {"get": {"operationId": "getX", "responses": {"200": {}}}}},
            "components": {"schemas": {"X": {"type": "object"}}},
        }
        self.assertEqual([], check.openapi_errors(doc))
        changed = copy.deepcopy(doc)
        changed["paths"]["/y"] = copy.deepcopy(changed["paths"]["/x"])
        self.assertIn("missing/duplicate operationId", check.openapi_errors(changed))
        changed = copy.deepcopy(doc)
        changed["components"]["schemas"]["Y"] = {"$ref": "#/components/schemas/Missing"}
        self.assertIn("unresolved OpenAPI reference", check.openapi_errors(changed))
        changed["components"]["schemas"]["Y"] = {"$ref": "https://example.test/schema"}
        self.assertTrue(check.openapi_errors(changed))
        self.assertTrue(check.openapi_errors({"openapi": "3.1.0", "info": {}, "paths": {}}))

    def test_evidence_update_narrow_boundary(self):
        task_path = "docs/tasks/TASK-004-governance-v2.md"
        task_text = (gov.ROOT / task_path).read_text()
        updated = task_text.replace(gov.BEGIN, gov.BEGIN + "\nReview: PASS")
        self.assertEqual(
            [],
            check.evidence_errors(
                {task_path: task_text}, {task_path: updated}, task_path, "TASK-004"
            ),
        )
        changed = task_text.replace('risk = "L3"', 'risk = "L1"')
        self.assertTrue(
            check.evidence_errors(
                {task_path: task_text}, {task_path: changed}, task_path, "TASK-004"
            )
        )
        self.assertTrue(
            check.evidence_errors({"AGENTS.md": "old"}, {"AGENTS.md": "new"}, task_path, "TASK-004")
        )
        self.assertTrue(
            check.evidence_errors({task_path: task_text}, {task_path: None}, task_path, "TASK-004")
        )

    def test_index_only_current_row(self):
        index = "docs/tasks/任务索引.md"
        old = "| [TASK-004：V2](x) | IN_REVIEW |\n| [TASK-003：API](y) | READY |\n"
        new = old.replace("IN_REVIEW", "ACCEPTED")
        self.assertEqual(
            [], check.evidence_errors({index: old}, {index: new}, "task.md", "TASK-004")
        )
        self.assertTrue(
            check.evidence_errors(
                {index: old}, {index: new.replace("READY", "MERGED")}, "task.md", "TASK-004"
            )
        )

    def test_missing_command_fails_not_pass(self):
        with patch.object(check.subprocess, "run", side_effect=FileNotFoundError):
            self.assertEqual(1, check.run_command(".", ["missing-tool"]))

    def test_nonzero_and_timeout_fail(self):
        result = subprocess.CompletedProcess([], 3, b"test failed", b"")
        with patch.object(check.subprocess, "run", return_value=result):
            self.assertEqual(1, check.run_command(".", ["fake-test"]))
        with patch.object(
            check.subprocess, "run", side_effect=subprocess.TimeoutExpired("fake-test", 600)
        ):
            self.assertEqual(1, check.run_command(".", ["fake-test"]))

    def test_profiles_never_install_or_format_source(self):
        for profile in check.PROFILE_NAMES:
            for _, command in check.commands(profile):
                self.assertFalse({"install", "sync", "ci", "--write"} & set(command))
                if "format" in command:
                    self.assertIn("--check", command)


if __name__ == "__main__":
    unittest.main()
