# Semantic-Linter

Semantic-Linter is a plugin and CLI for narrowing wide-boundary wording in LLM instruction files. It targets `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, prompt docs, command docs, and similar instruction assets where vague wording can cause hallucination or scope creep.

## Current Architecture

Semantic-Linter now uses a layered design instead of a pointer-only design:

- `SessionStart` injects a compact `STL:` pointer to the active `semantic-rules.md`.
- `SubagentStart` propagates the same pointer into subagents.
- `UserPromptSubmit` can warn on vague wording before the prompt reaches the model.
- `PreToolUse` warns before `Write` and `Edit` operations touch instruction files.
- `PostToolUse` re-checks the resulting content and records escalation state.
- `bin/scan.js` remains the explicit CLI scanner for single files, directories, or the current workspace.

The default operating mode is `guarded`:

- `off`: disable all semantic-linter behavior.
- `pointer`: keep only the lightweight rules pointer.
- `guarded`: pointer + write-time checks.
- `strict`: pointer + write-time checks + prompt scanning.

## Rule Source Strategy

Rules are resolved with `project-first` behavior by default:

1. Look upward from the edited file or current workspace for the nearest `semantic-rules.md`.
2. Fall back to the plugin-bundled `semantic-rules.md` if no project file exists.

You can force plugin-only resolution with `.semantic-linter.json`.

## Installation

### Claude Code

```bash
claude plugin marketplace add SummerSec/semantic-linter
claude plugin install semantic-linter@summersec-semantic-linter
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add SummerSec/semantic-linter
codex plugin add semantic-linter@semantic-linter
```

Codex does not consume Claude hook manifests. Its project-level integration is the managed rules block in `AGENTS.md`.

## Project Bootstrap

To install project-local semantic rules into the current repo:

```bash
node /absolute/path/to/semantic-linter/scripts/build-rules.js --existing "$(pwd)"
```

This writes:

- `semantic-rules.md`
- a managed rules block in existing `AGENTS.md` and/or `CLAUDE.md`

If neither file exists, the script creates the host-appropriate default target:

- Codex or auto host: `AGENTS.md`
- Claude host: `CLAUDE.md`

Useful commands:

```bash
npm run build-rules
npm run build-rules:check
npm run build-lexicon
npm run build-lexicon:check
npm run scan -- <file>
npm test
```

## Configuration

Optional repo config lives in `.semantic-linter.json`.

Supported fields:

```json
{
  "ignoreTrapIds": ["T01"],
  "ignorePathSubstrings": ["fixtures/generated/"],
  "ignoreStructuralTypes": ["open_ended_verb"],
  "defaultMode": "guarded",
  "ruleSource": "project-first",
  "enablePromptScan": false,
  "maxFindingsPerHook": 3
}
```

Notes:

- `defaultMode` accepts `off`, `pointer`, `guarded`, `strict`.
- `ruleSource` accepts `project-first` and `plugin-only`.
- `enablePromptScan` enables `UserPromptSubmit` in `guarded` mode.
- `strict` always enables prompt scanning.

## Detection Scope

Semantic-Linter scans instruction-like files matched by path conventions:

- file names: `SKILL.md`, `AGENTS.md`, `CLAUDE.md`
- suffixes: `*.prompt.md`, `*_definitions.md`, `*_examples.md`
- directories: `skills/`, `agents/`, `commands/`, `rules/`, `prompts/`

## Development Notes

Key runtime files:

- `hooks/session-start.js`
- `hooks/subagent-start.js`
- `hooks/user-prompt-submit.js`
- `hooks/pre-tool-use.js`
- `hooks/post-tool-use.js`
- `hooks/config.js`
- `hooks/runtime.js`
- `hooks/rules-resolver.js`

Core library files:

- `lib/content-scanner.js`
- `lib/structural-analyzer.js`
- `lib/report-formatter.js`
- `lib/state-manager.js`
- `lib/config-loader.js`

## Testing

```bash
npm test
```

`npm test` runs:

- `build-lexicon:check`
- `build-rules:check`
- `tests/test-scanner.js`
- `tests/test-new-features.js`

The test suite covers scanner behavior, generator idempotence, manifest alignment, and stdin-driven hook entrypoints.
