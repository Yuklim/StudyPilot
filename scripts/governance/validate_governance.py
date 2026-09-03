"""V2 governance structure and behavior checks. Requires Python 3.11+."""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    raise SystemExit("Python >=3.11 required; use backend/.venv/bin/python.") from None

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = "docs/governance/risk-policy.json"
STATES = {
    "DRAFT",
    "READY",
    "IN_PROGRESS",
    "IN_REVIEW",
    "IN_ACCEPTANCE",
    "ACCEPTED",
    "MERGED",
    "RETURNED",
    "BLOCKED",
    "CANCELLED",
}
AGENTS = {
    "coordinator",
    "requirements_owner",
    "architecture_owner",
    "repo_maintainer",
    "resource_worker",
    "learning_worker",
    "frontend_worker",
    "document_worker",
    "ai_worker",
    "rag_worker",
    "study_agent_worker",
    "qa_reviewer",
    "integration_owner",
}
SKILLS = {
    "studypilot-task-intake",
    "studypilot-implement-task",
    "studypilot-review-change",
    "studypilot-stage-acceptance",
}
REQUIRED = [
    "AGENTS.md",
    ".codex/config.toml",
    POLICY_PATH,
    "docs/governance/多Agent开发制度使用指南.md",
    "docs/governance/角色与模块边界.md",
    "docs/governance/Git与合并门禁.md",
    "docs/governance/风险分级与检查规则.md",
    "docs/governance/templates/TASK_TEMPLATE.md",
    "docs/governance/templates/HANDOFF_TEMPLATE.md",
    "docs/governance/templates/REVIEW_TEMPLATE.md",
    "docs/governance/templates/STAGE_ACCEPTANCE_TEMPLATE.md",
    "docs/governance/templates/MODULE_AGENTS_TEMPLATE.md",
    "docs/tasks/任务索引.md",
    "scripts/governance/check_task.py",
]
TASK_BLOCK = re.compile(r"(?ms)^\x60\x60\x60toml\n(.*?)^\x60\x60\x60\s*$")
BEGIN = "<!-- EVIDENCE:BEGIN -->"
END = "<!-- EVIDENCE:END -->"


def load_policy(root: Path = ROOT) -> dict:
    return json.loads((root / POLICY_PATH).read_text())


def validate_policy(policy: dict) -> list[str]:
    errors = []
    if policy.get("version") != 2:
        errors.append("policy version must be 2")
    expected = {
        "L1": {"review": False, "acceptance": False},
        "L2": {"review": True, "acceptance": False},
        "L3": {"review": True, "acceptance": True},
    }
    if policy.get("levels") != expected:
        errors.append("risk routes must preserve L1/L2/L3 gates")
    for key in ("high_risk_flags", "normal_flags", "low_risk_flags", "high_risk_paths"):
        values = policy.get(key)
        if (
            not isinstance(values, list)
            or not values
            or not all(isinstance(value, str) and value for value in values)
        ):
            errors.append(f"invalid policy list: {key}")
    required_flags = {
        "architecture",
        "public-api",
        "migration",
        "security",
        "authentication",
        "critical-data",
        "major-cross-module",
        "governance",
        "deletion",
        "sensitive-storage",
    }
    if not required_flags <= set(policy.get("high_risk_flags", [])):
        errors.append("missing high-risk category")
    required_paths = {
        "AGENTS.md",
        "**/AGENTS.md",
        ".codex/**",
        ".agents/**",
        "docs/governance/**",
        "scripts/governance/**",
        "docs/contracts/**",
        "docs/architecture/**",
        "项目需求说明.md",
        "项目背景与介绍.md",
    }
    if not required_paths <= set(policy.get("high_risk_paths", [])):
        errors.append("missing protected risk path")
    expected_exception = {
        "TASK004": {
            "task_id": "TASK-004",
            "authorization": "V2_USER_REQUEST_2026-09-03",
            "review": True,
            "acceptance": False,
        }
    }
    if policy.get("exceptions") != expected_exception:
        errors.append("only the user-authorized TASK-004 acceptance exception is permitted")
    return errors


def required_stages(risk: str, task_id: str = "", exception: str = "") -> tuple[str, ...]:
    if risk not in ("L1", "L2", "L3"):
        raise ValueError("unknown risk")
    stages = ["worker"]
    if risk in ("L2", "L3"):
        stages.append("review")
    if exception:
        if (task_id, exception, risk) != ("TASK-004", "V2_USER_REQUEST_2026-09-03", "L3"):
            raise ValueError("unauthorized acceptance exception")
    elif risk == "L3":
        stages.append("acceptance")
    return tuple(stages)


def risk_floor(paths: list[str], flags: list[str], policy: dict) -> str:
    known = set(policy["high_risk_flags"] + policy["normal_flags"] + policy["low_risk_flags"])
    if not flags or not set(flags) <= known:
        raise ValueError("missing or unknown risk flags")
    if set(flags) & set(policy["high_risk_flags"]) or any(
        fnmatch.fnmatchcase(path, pattern)
        for path in paths
        for pattern in policy["high_risk_paths"]
    ):
        return "L3"
    if set(flags) & set(policy["normal_flags"]):
        return "L2"
    # Semantic low-risk assertion remains the coordinator responsibility.
    return "L1"


def valid_scope(pattern: str) -> bool:
    if not isinstance(pattern, str) or not pattern or pattern.startswith(("/", "-")):
        return False
    if "\\" in pattern or any(part in ("", ".", "..") for part in pattern.split("/")):
        return False
    stem = pattern.removesuffix("/**")
    return bool(stem) and not any(char in stem for char in "*?[]")


def in_scope(path: str, patterns: list[str]) -> bool:
    if not valid_scope(path):
        return False
    return any(
        path.startswith(pattern[:-2]) if pattern.endswith("/**") else path == pattern
        for pattern in patterns
    )


def parse_task(text: str) -> dict:
    matches = list(TASK_BLOCK.finditer(text))
    if len(matches) != 1:
        raise ValueError("task must have exactly one TOML metadata block")
    if text.count(BEGIN) != 1 or text.count(END) != 1 or text.index(BEGIN) > text.index(END):
        raise ValueError("task must have exactly one ordered evidence region")
    if matches[0].end() > text.index(BEGIN):
        raise ValueError("authorization metadata must be outside evidence")
    return tomllib.loads(matches[0].group(1))


def validate_task(task: dict, policy: dict) -> list[str]:
    errors = []
    for name in ("id", "status", "risk", "risk_reason", "owner", "base"):
        if not isinstance(task.get(name), str) or not task[name].strip():
            errors.append(f"missing task field: {name}")
    if task.get("schema_version") != 2:
        errors.append("task schema_version must be 2")
    if not re.fullmatch(r"TASK-\d{3,}", task.get("id", "")):
        errors.append("invalid task id")
    if task.get("status") not in STATES:
        errors.append("invalid task status")
    if task.get("owner") not in AGENTS:
        errors.append("unknown task writer")
    if not re.fullmatch(r"[a-f0-9]{40}", task.get("base", "")):
        errors.append("base must be a full commit SHA")
    paths = task.get("allowed_paths")
    if not isinstance(paths, list) or not paths or not all(valid_scope(p) for p in paths):
        errors.append("allowlist must contain bounded relative paths")
    checks = task.get("checks")
    if not isinstance(checks, list) or not all(
        c in ("governance", "backend", "frontend", "contracts") for c in checks
    ):
        errors.append("unknown or missing check groups")
    try:
        flags = task.get("risk_flags")
        if not isinstance(flags, list) or not all(isinstance(f, str) for f in flags):
            raise ValueError("risk_flags must be a string list")
        floor = risk_floor([], flags, policy)
        if task.get("risk", "") < floor:
            raise ValueError("risk is lower than declared impact")
        stages = required_stages(
            task.get("risk", ""), task.get("id", ""), task.get("acceptance_exception", "")
        )
        if task.get("status") == "IN_REVIEW" and "review" not in stages:
            raise ValueError("L1 does not have an independent Review stage")
        if task.get("status") == "IN_ACCEPTANCE" and "acceptance" not in stages:
            raise ValueError("task does not have an independent Acceptance stage")
    except (ValueError, TypeError) as exc:
        errors.append(str(exc))
    return errors


def frozen_task_text(text: str) -> str:
    """Ignore only task status and the single explicit evidence region."""
    parse_task(text)
    match = TASK_BLOCK.search(text)
    block = re.sub(r'(?m)^status = "[A-Z_]+"$', 'status = "<evidence>"', match.group(1))
    normalized = text[: match.start(1)] + block + text[match.end(1) :]
    start, end = normalized.index(BEGIN), normalized.index(END) + len(END)
    return normalized[:start] + BEGIN + END + normalized[end:]


def agent_errors(data: dict) -> list[str]:
    errors = []
    name = data.get("name")
    for field in ("name", "description", "developer_instructions"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"{name}: missing {field}")
    mode = data.get("sandbox_mode")
    if mode not in ("read-only", "workspace-write"):
        errors.append(f"{name}: invalid sandbox")
    if name in ("qa_reviewer", "integration_owner") and mode != "read-only":
        errors.append(f"{name}: role default must stay read-only")
    return errors


def validate(root: Path = ROOT, *, allow_unborn: bool = False) -> list[str]:
    errors = []
    for path in REQUIRED:
        if not (root / path).is_file():
            errors.append(f"missing: {path}")
    try:
        policy = load_policy(root)
        errors.extend(validate_policy(policy))
        config = tomllib.loads((root / ".codex/config.toml").read_text())["agents"]
        if (
            config.get("enabled") is not True
            or type(config.get("max_concurrent_threads_per_session")) is not int
            or not 1 <= config["max_concurrent_threads_per_session"] <= 4
        ):
            errors.append("invalid enabled/concurrency configuration")
        found = set()
        for path in sorted((root / ".codex/agents").glob("*.toml")):
            data = tomllib.loads(path.read_text())
            name = data.get("name")
            if name in found:
                errors.append(f"duplicate agent: {name}")
            found.add(name)
            errors.extend(agent_errors(data))
        if found != AGENTS:
            errors.append("agent registry mismatch")
        for name in SKILLS:
            text = (root / ".agents/skills" / name / "SKILL.md").read_text()
            front = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
            if (
                not front
                or f"name: {name}" not in front.group(1)
                or not re.search(r"(?m)^description: .+", front.group(1))
            ):
                errors.append(f"invalid skill metadata: {name}")
        for path in (root / "docs/tasks").glob("TASK-*.md"):
            text = path.read_text()
            if re.search(r"(?m)^schema_version = 2$", text):
                task = parse_task(text)
                errors.extend(f"{path.name}: {e}" for e in validate_task(task, policy))
                if not path.name.startswith(task["id"] + "-"):
                    errors.append(f"task id/filename mismatch: {path.name}")
        if (root / "AGENTS.md").stat().st_size > 16 * 1024:
            errors.append("root rules exceed V2 16 KiB context budget")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"governance parse failure: {exc}")
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode and not allow_unborn:
        errors.append("Git baseline missing; bootstrap approval required")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-unborn", action="store_true")
    args = parser.parse_args()
    errors = validate(allow_unborn=args.allow_unborn)
    if errors:
        print("\n".join("FAIL: " + error for error in errors))
        return 1
    print("Governance V2 PASS: risk routes, permissions, registry, task metadata.")
    print("This does not certify prose consistency or actual runtime permissions; Review does.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
