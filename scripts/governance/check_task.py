"""Read-only source checks plus relevant test commands; never install project dependencies."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

if __package__:
    from . import validate_governance as gov
else:
    import validate_governance as gov

ROOT = gov.ROOT
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
SECRET_PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "provider-token": re.compile(
        r"\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"
    ),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    "credential-assignment": re.compile(
        r"(?im)^\s*(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*[\x22\x27]?[A-Za-z0-9_+/=-]{16,}[\x22\x27]?\s*$"
    ),
}
PROFILE_NAMES = {"governance", "backend", "frontend", "contracts"}


def valid_task_branch(branch: str) -> bool:
    return bool(re.fullmatch(r"agent/[a-z0-9_-]+/TASK-\d{3,}-.+", branch))


def git(*args: str) -> bytes:
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, env=ENV, check=False)
    if result.returncode:
        # Do not echo arbitrary Git content, filenames or credentials from stderr.
        raise ValueError(f"git command failed (exit {result.returncode}): {args[0]}")
    return result.stdout


def revision(value: str) -> str:
    if value.startswith("-"):
        raise ValueError("invalid revision")
    return git("rev-parse", "--verify", value + "^{commit}").decode().strip()


def selected_profiles(paths: list[str], explicit: list[str]) -> set[str]:
    if not set(explicit) <= PROFILE_NAMES:
        raise ValueError("unknown check group")
    groups = set(explicit)
    for path in paths:
        if path == "AGENTS.md" or path.startswith(
            (".codex/", ".agents/", "docs/governance/", "scripts/governance/")
        ):
            groups.add("governance")
        if path.startswith("backend/"):
            groups.add("backend")
        if path.startswith("frontend/"):
            groups.add("frontend")
        if path.startswith("docs/contracts/"):
            groups.add("contracts")
    return groups


def secret_findings(path: str, text: str) -> list[str]:
    findings = [
        f"{path}: sensitive pattern {name}"
        for name, pattern in SECRET_PATTERNS.items()
        if pattern.search(text)
    ]
    name = Path(path).name
    if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
        findings.append(f"{path}: local environment file cannot be committed")
    return findings


def openapi_errors(document: dict) -> list[str]:
    """Structure only, not a full JSON Schema/behavior validator."""
    errors = []
    if not str(document.get("openapi", "")).startswith("3.1."):
        errors.append("OpenAPI baseline must use 3.1.x")
    if not isinstance(document.get("info"), dict) or not isinstance(document.get("paths"), dict):
        return errors + ["OpenAPI info/paths missing"]
    operation_ids = set()
    count = 0
    for path, item in document["paths"].items():
        if path.startswith("x-"):
            continue
        if not path.startswith("/") or not isinstance(item, dict):
            errors.append("invalid OpenAPI path")
            continue
        for verb, operation in item.items():
            if verb not in {"get", "put", "post", "patch", "delete", "options", "head", "trace"}:
                continue
            count += 1
            if not isinstance(operation, dict):
                errors.append("invalid operation")
                continue
            op_id = operation.get("operationId")
            if not isinstance(op_id, str) or not op_id or op_id in operation_ids:
                errors.append("missing/duplicate operationId")
            else:
                operation_ids.add(op_id)
            if not isinstance(operation.get("responses"), dict) or not operation["responses"]:
                errors.append("operation responses missing")
    if count == 0:
        errors.append("no OpenAPI operations")

    def visit(value: object) -> None:
        if isinstance(value, dict):
            ref = value.get("$ref")
            if ref is not None:
                if not isinstance(ref, str) or not ref.startswith("#/"):
                    errors.append("external/invalid ref requires explicit task validation")
                else:
                    target = document
                    try:
                        for part in ref[2:].split("/"):
                            target = target[part.replace("~1", "/").replace("~0", "~")]
                    except (KeyError, TypeError):
                        errors.append("unresolved OpenAPI reference")
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(document)
    return errors


def evidence_errors(
    before: dict[str, str | None],
    after: dict[str, str | None],
    task_path: str,
    task_id: str,
) -> list[str]:
    errors = []
    index_path = "docs/tasks/任务索引.md"
    reports = {f"docs/tasks/{task_id}-REVIEW.md", f"docs/tasks/{task_id}-ACCEPTANCE.md"}
    for path in before.keys() | after.keys():
        old, new = before.get(path), after.get(path)
        if old == new:
            continue
        try:
            if path == task_path and old is not None and new is not None:
                if gov.frozen_task_text(old) != gov.frozen_task_text(new):
                    errors.append("frozen task authorization/implementation/test evidence changed")
            elif path == index_path and old is not None and new is not None:

                def remove_row(text: str) -> str:
                    lines = text.splitlines(keepends=True)
                    return "".join(
                        line
                        for line in lines
                        if not re.match(r"^\| \[" + re.escape(task_id) + r"[：:]", line)
                    )

                if remove_row(old) != remove_row(new):
                    errors.append("index changed outside the current task row")
            elif path in reports and new is not None:
                pass  # Report authenticity is checked by the coordinator, not invented here.
            else:
                errors.append(f"not evidence-only: {path}")
        except ValueError as exc:
            errors.append(str(exc))
    return errors


def commands(group: str) -> list[tuple[str, list[str]]]:
    py = sys.executable
    backend_bin = str(ROOT / "backend/.venv/bin")
    if group == "governance":
        return [
            (".", [py, "scripts/governance/validate_governance.py"]),
            (".", [f"{backend_bin}/ruff", "check", "--isolated", "scripts/governance"]),
            (
                ".",
                [
                    f"{backend_bin}/ruff",
                    "format",
                    "--check",
                    "--isolated",
                    "--line-length",
                    "100",
                    "scripts/governance",
                ],
            ),
            (
                ".",
                [py, "-m", "unittest", "discover", "-s", "scripts/governance", "-p", "test_*.py"],
            ),
        ]
    if group == "backend":
        return [
            ("backend", [f"{backend_bin}/ruff", "format", "--check", "."]),
            ("backend", [f"{backend_bin}/ruff", "check", "."]),
            ("backend", [f"{backend_bin}/mypy", "src", "tests"]),
            ("backend", [f"{backend_bin}/pytest"]),
            ("backend", ["uv", "build", "--offline"]),
        ]
    if group == "frontend":
        return [
            ("frontend", ["npm", "run", command])
            for command in ("format:check", "lint", "typecheck")
        ] + [
            ("frontend", ["npm", "run", "test", "--", "--run"]),
            ("frontend", ["npm", "run", "build"]),
        ]
    if group == "contracts":
        script = (
            "from pathlib import Path; from fastapi.openapi.models import OpenAPI; "
            'paths=list(Path("docs/contracts").glob("*openapi*.json")); '
            'assert paths, "no OpenAPI snapshot to validate"; '
            "[OpenAPI.model_validate_json(p.read_text()) for p in paths]"
        )
        return [(".", [f"{backend_bin}/python", "-c", script])]
    raise ValueError("unknown check group")


def run_command(directory: str, command: list[str]) -> int:
    print(f"CHECK cwd={directory}: {shlex.join(command)}", flush=True)
    try:
        result = subprocess.run(
            command, cwd=ROOT / directory, capture_output=True, env=ENV, timeout=600, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"NOT_RUN/FAIL: {type(exc).__name__}", flush=True)
        return 1
    output = (result.stdout + result.stderr).decode(errors="replace")
    for pattern in SECRET_PATTERNS.values():
        output = pattern.sub("[REDACTED]", output)
    if output:
        print(output[-5000:], flush=True)
    print(f"exit={result.returncode}", flush=True)
    return int(result.returncode != 0)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--worktree", action="store_true")
    mode.add_argument("--candidate", default="HEAD")
    parser.add_argument("--static-only", action="store_true")
    parser.add_argument("--evidence-from")
    args = parser.parse_args()
    try:
        if not gov.valid_scope(args.task) or args.task.endswith("/**"):
            raise ValueError("task must be an exact relative file")
        branch = git("symbolic-ref", "--short", "HEAD").decode().strip()
        if not valid_task_branch(branch):
            raise ValueError("run on the named task branch, never main or detached HEAD")
        candidate = revision(args.candidate)
        base_files: dict[str, bytes | None] = {}

        def read_at(ref: str, path: str) -> bytes | None:
            result = subprocess.run(
                ["git", "show", f"{ref}:{path}"],
                cwd=ROOT,
                capture_output=True,
                env=ENV,
                check=False,
            )
            return result.stdout if result.returncode == 0 else None

        def read_current(path: str) -> bytes | None:
            if not args.worktree:
                return read_at(candidate, path)
            file = ROOT / path
            if file.is_symlink():
                raise ValueError(f"symlink requires explicit review: {path}")
            return file.read_bytes() if file.exists() else None

        task_bytes = read_current(args.task)
        if task_bytes is None:
            raise ValueError("task does not exist in selected input")
        task = gov.parse_task(task_bytes.decode())
        policy_bytes = read_current(gov.POLICY_PATH)
        if policy_bytes is None:
            raise ValueError("risk policy missing in selected input")
        policy = json.loads(policy_bytes)
        errors = gov.validate_policy(policy) + gov.validate_task(task, policy)
        if errors:
            raise ValueError("; ".join(errors))
        if f"/{task['id']}-" not in branch or not Path(args.task).name.startswith(task["id"] + "-"):
            raise ValueError("branch/task identity mismatch")
        base = revision(task["base"])
        git("merge-base", "--is-ancestor", base, candidate)
        if args.evidence_from:
            if args.worktree:
                raise ValueError("evidence check requires committed inputs")
            old = revision(args.evidence_from)
            git("merge-base", "--is-ancestor", old, candidate)
            paths = (
                git("diff", "--name-only", "--no-renames", "-z", old, candidate)
                .decode()
                .split("\0")
            )
            paths = [p for p in paths if p]

            def read_text_at(ref: str, path: str) -> str | None:
                blob = read_at(ref, path)
                return blob.decode() if blob is not None else None

            before = {p: read_text_at(old, p) for p in paths}
            after = {p: read_text_at(candidate, p) for p in paths}
            errors = evidence_errors(before, after, args.task, task["id"])
            if errors:
                raise ValueError("; ".join(errors))
            print(f"EVIDENCE_ONLY PASS {old}..{candidate}; no product tests rerun")
            return 0

        diff_args = ["diff", "--name-only", "--no-renames", "-z", base]
        if not args.worktree:
            diff_args.append(candidate)
        paths = {p for p in git(*diff_args).decode().split("\0") if p}
        if args.worktree:
            paths |= {
                p
                for p in git("ls-files", "--others", "--exclude-standard", "-z")
                .decode()
                .split("\0")
                if p
            }
        changed = sorted(paths)
        if not changed:
            raise ValueError("no changes in selected input")
        out_of_scope = [p for p in changed if not gov.in_scope(p, task["allowed_paths"])]
        if out_of_scope:
            raise ValueError("out of scope: " + ", ".join(out_of_scope))
        floor = gov.risk_floor(changed, task["risk_flags"], policy)
        if task["risk"] < floor:
            raise ValueError(f"declared {task['risk']} below detected {floor}")
        diff_check = ["diff", "--check", base] + ([] if args.worktree else [candidate])
        git(*diff_check)
        digest = hashlib.sha256()
        for path in changed:
            data = read_current(path)
            base_files[path] = data
            if path not in {args.task, "docs/tasks/任务索引.md"}:
                digest.update(path.encode() + b"\0")
                digest.update(b"DELETED" if data is None else hashlib.sha256(data).digest())
            if data is None:
                continue
            try:
                text = data.decode("utf-8")
                if "\0" in text:
                    raise UnicodeDecodeError("utf-8", b"\0", 0, 1, "binary")
            except UnicodeDecodeError:
                raise ValueError(f"binary file needs explicit manual validation: {path}") from None
            errors.extend(secret_findings(path, text))
            if path.endswith(".json"):
                document = json.loads(text)
                if isinstance(document, dict) and "openapi" in document:
                    errors.extend(f"{path}: {e}" for e in openapi_errors(document))
        if errors:
            raise ValueError("; ".join(errors))
        groups = selected_profiles(changed, task["checks"])
        print(f"STATIC PASS base={base} input={'WORKTREE' if args.worktree else candidate}")
        print(
            f"risk={task['risk']} stages={gov.required_stages(task['risk'], task['id'], task.get('acceptance_exception', ''))}"
        )
        print(f"files={len(changed)} product_fingerprint={digest.hexdigest()}")
        print("profiles=" + ",".join(sorted(groups)))
        if args.static_only:
            print("PROFILE_TESTS NOT_RUN (--static-only); not a full test PASS")
            return 0
        if not args.worktree and (candidate != revision("HEAD") or git("status", "--porcelain")):
            raise ValueError("full checks require the candidate checked out with a clean worktree")
        initial_status = git("status", "--porcelain", "--untracked-files=all")
        failures = sum(
            run_command(directory, command)
            for group in sorted(groups)
            for directory, command in commands(group)
        )

        # Tests may write generated caches, but may not silently change checked inputs.
        def disk_bytes(path: str) -> bytes | None:
            file = ROOT / path
            if file.is_symlink():
                raise ValueError("checked input became a symlink")
            return file.read_bytes() if file.exists() else None

        if any(disk_bytes(path) != data for path, data in base_files.items()) or (
            initial_status != git("status", "--porcelain", "--untracked-files=all")
        ):
            failures += 1
            print("FAIL: inputs changed during checks")
        print("CHECKS PASS" if failures == 0 else f"CHECKS FAIL: {failures}")
        return int(failures != 0)
    except (ValueError, OSError, UnicodeError, TypeError, KeyError) as exc:
        print("FAIL: " + str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
