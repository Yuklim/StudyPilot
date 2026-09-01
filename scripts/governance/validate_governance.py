#!/usr/bin/env python3
"""Validate StudyPilot's repository-level multi-agent governance files."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10 and earlier
    tomllib = None


ROOT = Path(__file__).resolve().parents[2]

REQUIRED_FILES = (
    "AGENTS.md",
    ".codex/config.toml",
    "docs/governance/多Agent开发制度使用指南.md",
    "docs/governance/角色与模块边界.md",
    "docs/governance/Git与合并门禁.md",
    "docs/governance/templates/TASK_TEMPLATE.md",
    "docs/governance/templates/HANDOFF_TEMPLATE.md",
    "docs/governance/templates/REVIEW_TEMPLATE.md",
    "docs/governance/templates/STAGE_ACCEPTANCE_TEMPLATE.md",
    "docs/governance/templates/MODULE_AGENTS_TEMPLATE.md",
    "docs/tasks/任务索引.md",
    "scripts/governance/test_validate_governance.py",
)

REQUIRED_AGENTS = {
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

REQUIRED_SKILLS = {
    "studypilot-task-intake",
    "studypilot-implement-task",
    "studypilot-review-change",
    "studypilot-stage-acceptance",
}

# These are enforcement boundaries, not prose style checks. Stable IDs let the
# negative regression suite prove that removing any one guardrail fails closed.
SEMANTIC_INVARIANTS = (
    (
        "merge.user_only",
        "AGENTS.md",
        "只有用户本人可以决定并执行最终合并",
    ),
    (
        "control_plane.intake_branch",
        "AGENTS.md",
        "agent/coordinator/<task-id>-intake",
    ),
    (
        "control_plane.evidence_branch",
        "AGENTS.md",
        "agent/coordinator/<task-id>-evidence",
    ),
    (
        "control_plane.closeout_branch",
        "AGENTS.md",
        "agent/coordinator/<task-id>-closeout",
    ),
    (
        "control_plane.no_direct_main",
        "AGENTS.md",
        "`coordinator` 也不得直接在 `main` 写入或提交",
    ),
    (
        "review.candidate_includes_handoff",
        "AGENTS.md",
        "交接报告必须包含在该候选提交中",
    ),
    (
        "evidence.exact_allowlist",
        "AGENTS.md",
        "只允许原样写入同一任务的 `REVIEW`、`ACCEPTANCE`，以及仅修改任务单与索引的状态字段和决定日志",
    ),
    (
        "review.post_change_invalidates",
        "AGENTS.md",
        "任何超出该白名单的审查后变更都会生成新的候选 SHA，使旧审查与验收结论失效",
    ),
    (
        "integration.no_write",
        ".codex/agents/integration-owner.toml",
        "不得修改文件、创建提交、处理集成冲突、cherry-pick、rebase 或执行任何合并",
    ),
    (
        "integration.sandbox_declaration",
        ".codex/agents/integration-owner.toml",
        'sandbox_mode = "read-only"',
    ),
    (
        "reviewer.sandbox_declaration",
        ".codex/agents/qa-reviewer.toml",
        'sandbox_mode = "read-only"',
    ),
    (
        "intake.ready_gate",
        ".agents/skills/studypilot-task-intake/SKILL.md",
        "Set status to `READY` only when every authorization field is complete",
    ),
    (
        "implementation.handoff",
        ".agents/skills/studypilot-implement-task/SKILL.md",
        "Produce a handoff using `docs/governance/templates/HANDOFF_TEMPLATE.md`",
    ),
    (
        "review.read_only",
        ".agents/skills/studypilot-review-change/SKILL.md",
        "verify the actual runtime permission is read-only",
    ),
    (
        "review.output_decisions",
        ".agents/skills/studypilot-review-change/SKILL.md",
        "`READY_FOR_ACCEPTANCE`, `CHANGES_REQUIRED`, or `BLOCKED`",
    ),
    (
        "acceptance.read_only",
        ".agents/skills/studypilot-stage-acceptance/SKILL.md",
        "Verify the actual runtime is `read-only`",
    ),
    (
        "acceptance.no_conflict_resolution",
        ".agents/skills/studypilot-stage-acceptance/SKILL.md",
        "Do not modify files, create commits, resolve integration conflicts, cherry-pick, rebase",
    ),
    *(
        (
            f"task_template.section_{number}",
            "docs/governance/templates/TASK_TEMPLATE.md",
            f"## {number}. {title}",
        )
        for number, title in (
            (1, "基本信息"),
            (2, "背景与依据"),
            (3, "目标"),
            (4, "非目标"),
            (5, "允许修改路径"),
            (6, "禁止修改路径"),
            (7, "前置条件与依赖"),
            (8, "功能要求"),
            (9, "验收条件"),
            (10, "必须执行的检查"),
            (11, "审查要求"),
            (12, "交接要求"),
            (13, "决策与状态记录"),
        )
    ),
)


def load_semantic_texts(root: Path, errors: list[str]) -> dict[str, str]:
    texts: dict[str, str] = {}
    for relative_path in sorted({item[1] for item in SEMANTIC_INVARIANTS}):
        try:
            texts[relative_path] = (root / relative_path).read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"Cannot read semantic source {relative_path}: {exc}")
    return texts


def validate_semantic_texts(texts: dict[str, str], errors: list[str]) -> None:
    for invariant_id, relative_path, required_text in SEMANTIC_INVARIANTS:
        if required_text not in texts.get(relative_path, ""):
            errors.append(
                f"[{invariant_id}] missing required governance text in {relative_path}"
            )


def load_toml(path: Path, errors: list[str]) -> dict:
    if tomllib is not None:
        try:
            with path.open("rb") as handle:
                return tomllib.load(handle)
        except (OSError, tomllib.TOMLDecodeError) as exc:
            errors.append(f"Invalid TOML {path.relative_to(ROOT)}: {exc}")
            return {}

    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"Cannot read {path.relative_to(ROOT)}: {exc}")
        return {}

    if path.name == "config.toml":
        enabled = re.search(r"(?m)^enabled\s*=\s*(true|false)\s*$", text)
        max_threads = re.search(
            r"(?m)^max_concurrent_threads_per_session\s*=\s*(\d+)\s*$", text
        )
        return {
            "agents": {
                "enabled": enabled is not None and enabled.group(1) == "true",
                "max_concurrent_threads_per_session": (
                    int(max_threads.group(1)) if max_threads else None
                ),
            }
        }

    result: dict[str, str] = {}
    for field in ("name", "description", "sandbox_mode"):
        match = re.search(rf'(?m)^{field}\s*=\s*"([^"\n]*)"\s*$', text)
        if match:
            result[field] = match.group(1)
    instructions = re.search(
        r'(?ms)^developer_instructions\s*=\s*"""(.*?)"""\s*$', text
    )
    if instructions:
        result["developer_instructions"] = instructions.group(1)
    return result


def parse_skill_frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"Cannot read {path.relative_to(ROOT)}: {exc}")
        return {}

    match = re.match(r"\A---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        errors.append(f"Missing YAML frontmatter: {path.relative_to(ROOT)}")
        return {}

    metadata: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata


def git_head_exists() -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def git_ref_exists(ref: str) -> bool:
    result = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", ref],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def git_symbolic_head() -> str | None:
    result = subprocess.run(
        ["git", "symbolic-ref", "--quiet", "HEAD"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def validate(
    *,
    allow_unborn: bool,
    semantic_texts: dict[str, str] | None = None,
) -> list[str]:
    errors: list[str] = []

    if not (ROOT / ".git").exists():
        errors.append("Project is not a Git repository")
    else:
        has_head = git_head_exists()
        if not has_head:
            if not allow_unborn:
                errors.append(
                    "Git HEAD is missing; create the user-approved initial main baseline "
                    "before starting worktrees"
                )
            elif git_symbolic_head() != "refs/heads/main":
                errors.append(
                    "Bootstrap mode requires the unborn HEAD to point to main"
                )
        elif not git_ref_exists("refs/heads/main"):
            errors.append(
                "The main baseline is missing; create the user-approved initial commit "
                "on main before starting worktrees"
            )

    for relative_path in REQUIRED_FILES:
        if not (ROOT / relative_path).is_file():
            errors.append(f"Missing required file: {relative_path}")

    root_rules = ROOT / "AGENTS.md"
    if root_rules.is_file() and root_rules.stat().st_size > 32 * 1024:
        errors.append("Root AGENTS.md exceeds the default 32 KiB instruction budget")

    config_path = ROOT / ".codex/config.toml"
    config = load_toml(config_path, errors) if config_path.is_file() else {}
    agents_config = config.get("agents", {})
    if agents_config.get("enabled") is not True:
        errors.append(".codex/config.toml must enable agents")
    max_threads = agents_config.get("max_concurrent_threads_per_session")
    if not isinstance(max_threads, int) or not 1 <= max_threads <= 8:
        errors.append("Agent concurrency must be an integer from 1 to 8")

    agent_dir = ROOT / ".codex/agents"
    found_agents: dict[str, Path] = {}
    for path in sorted(agent_dir.glob("*.toml")):
        data = load_toml(path, errors)
        for field in ("name", "description", "developer_instructions"):
            if not isinstance(data.get(field), str) or not data[field].strip():
                errors.append(f"{path.relative_to(ROOT)} missing non-empty {field}")
        name = data.get("name")
        if isinstance(name, str):
            if name in found_agents:
                errors.append(f"Duplicate agent name {name}: {path.relative_to(ROOT)}")
            found_agents[name] = path
        if data.get("sandbox_mode") not in {"read-only", "workspace-write"}:
            errors.append(f"{path.relative_to(ROOT)} has unsupported sandbox_mode")

    missing_agents = REQUIRED_AGENTS - set(found_agents)
    if missing_agents:
        errors.append(f"Missing agent definitions: {', '.join(sorted(missing_agents))}")
    extra_agents = set(found_agents) - REQUIRED_AGENTS
    if extra_agents:
        errors.append(f"Unregistered agent definitions: {', '.join(sorted(extra_agents))}")
    reviewer_path = found_agents.get("qa_reviewer")
    if reviewer_path:
        reviewer = load_toml(reviewer_path, errors)
        if reviewer.get("sandbox_mode") != "read-only":
            errors.append("qa_reviewer must remain read-only")
    integration_path = found_agents.get("integration_owner")
    if integration_path:
        integration_owner = load_toml(integration_path, errors)
        if integration_owner.get("sandbox_mode") != "read-only":
            errors.append("[integration.runtime_read_only] integration_owner must remain read-only")

    skill_root = ROOT / ".agents/skills"
    found_skills: set[str] = set()
    for skill_dir in sorted(path for path in skill_root.iterdir() if path.is_dir()):
        skill_path = skill_dir / "SKILL.md"
        if not skill_path.is_file():
            errors.append(f"Missing SKILL.md: {skill_dir.relative_to(ROOT)}")
            continue
        metadata = parse_skill_frontmatter(skill_path, errors)
        name = metadata.get("name")
        description = metadata.get("description")
        if name != skill_dir.name:
            errors.append(
                f"Skill name/folder mismatch: {skill_dir.relative_to(ROOT)} declares {name!r}"
            )
        if not description:
            errors.append(f"Skill missing description: {skill_path.relative_to(ROOT)}")
        if name:
            found_skills.add(name)

    missing_skills = REQUIRED_SKILLS - found_skills
    if missing_skills:
        errors.append(f"Missing governance skills: {', '.join(sorted(missing_skills))}")
    extra_skills = found_skills - REQUIRED_SKILLS
    if extra_skills:
        errors.append(f"Unregistered governance skills: {', '.join(sorted(extra_skills))}")

    texts = semantic_texts
    if texts is None:
        texts = load_semantic_texts(ROOT, errors)
    validate_semantic_texts(texts, errors)

    return errors


def main() -> int:
    unknown_args = set(sys.argv[1:]) - {"--allow-unborn"}
    if unknown_args:
        print(f"Unknown arguments: {', '.join(sorted(unknown_args))}")
        return 2

    allow_unborn = "--allow-unborn" in sys.argv[1:]
    errors = validate(allow_unborn=allow_unborn)
    if errors:
        print("Governance validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Governance validation passed.")
    print(f"- {len(REQUIRED_AGENTS)} custom agents")
    print(f"- {len(REQUIRED_SKILLS)} repository skills")
    print("- root rules, workflow guide, task index, and templates present")
    print(f"- {len(SEMANTIC_INVARIANTS)} semantic governance invariants enforced")
    if allow_unborn and not git_head_exists():
        print("- bootstrap-only: Git HEAD is still missing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
