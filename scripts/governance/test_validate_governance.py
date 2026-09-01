#!/usr/bin/env python3
"""Negative regression tests for StudyPilot governance guardrails."""

from __future__ import annotations

import unittest

from scripts.governance import validate_governance as governance


class SemanticInvariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        load_errors: list[str] = []
        cls.texts = governance.load_semantic_texts(governance.ROOT, load_errors)
        if load_errors:
            raise AssertionError("; ".join(load_errors))

    def test_current_semantic_baseline_passes(self) -> None:
        errors: list[str] = []
        governance.validate_semantic_texts(self.texts, errors)
        self.assertEqual([], errors)

    def test_removing_each_guardrail_fails_closed(self) -> None:
        for invariant_id, relative_path, required_text in governance.SEMANTIC_INVARIANTS:
            with self.subTest(invariant_id=invariant_id):
                self.assertIn(required_text, self.texts[relative_path])
                mutated = dict(self.texts)
                mutated[relative_path] = mutated[relative_path].replace(
                    required_text, "", 1
                )
                errors: list[str] = []
                governance.validate_semantic_texts(mutated, errors)
                self.assertTrue(
                    any(error.startswith(f"[{invariant_id}]") for error in errors),
                    errors,
                )

    def test_integration_owner_cannot_be_changed_to_workspace_write(self) -> None:
        path = ".codex/agents/integration-owner.toml"
        mutated = dict(self.texts)
        mutated[path] = mutated[path].replace(
            'sandbox_mode = "read-only"', 'sandbox_mode = "workspace-write"', 1
        )
        errors: list[str] = []
        governance.validate_semantic_texts(mutated, errors)
        self.assertTrue(
            any(
                error.startswith("[integration.sandbox_declaration]")
                for error in errors
            ),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
