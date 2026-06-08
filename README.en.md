[简体中文](./README.md)

# semantic-linter

A Vibe Coding Tools plugin that detects **semantic trap words** in Skill / Prompt / Agent instruction files — words with overly broad semantic boundaries that can cause LLM hallucinations.

> Using "risk" instead of "vulnerability" in the same Skill can cause a **27% accuracy drop**, even with identical constraints and logic.

This project evolved from the theoretical framework presented in [*Don't Let LLMs "Overthink": Semantic Traps and Anti-Hallucination Design in SKILL Development*](https://sumsec.me/2026/%E5%88%AB%E8%AE%A9%E5%A4%A7%E6%A8%A1%E5%9E%8B_%E6%83%B3%E5%A4%AA%E5%A4%9A_%EF%BC%9ASKILL%E5%BC%80%E5%8F%91%E4%B8%AD%E7%9A%84%E8%AF%AD%E4%B9%89%E9%99%B7%E9%98%B1%E4%B8%8E%E6%8A%97%E5%B9%BB%E8%A7%89%E8%AE%BE%E8%AE%A1.html), turning its semantic trap detection methodology into an automated tool. 

## The Problem

In LLM instruction files, some word pairs appear synonymous to humans but activate vastly different semantic regions in the model:

| Wide (Risky) | Narrow (Precise) | Why It Matters |
|---|---|---|
| risk | vulnerability | "risk" triggers financial, health, legal associations — model loses focus |
| review | check | "review" implies subjective evaluation — model hallucinates opinions |
| issue | defect | "issue" activates debate/controversy meanings — model drifts off-topic |
| analyze | summarize | "analyze" has no boundary — model produces unbounded output |

semantic-linter catches these traps **automatically** every time you edit an instruction file.

## Features

- **27 semantic trap pairs**: 17 Chinese + 10 English, each with severity rating and replacement suggestion
- **Context-aware severity**: The same word gets different risk levels depending on its role (constraint keyword > task target > auxiliary)
- **4 structural risk detectors**: Open-ended verbs, abstract targets, modal downgrades, missing negation lists
- **Code block exclusion**: Skips ```` ``` ```` fenced blocks and `` ` `` inline code to avoid false positives
- **Bilingual**: Full Chinese and English support with language-specific detection strategies
- **Zero dependencies**: Pure Node.js, no npm install needed
- **Non-blocking**: Never interrupts Claude's workflow — findings are injected as warnings

### Five trigger points

| Trigger | When | Purpose |
|---|---|---|
| SessionStart Hook | session start / resume / compact | Inject trap-word awareness context (narration-style `STL：…`) |
| UserPromptSubmit Hook | user submits a message | Scan user instructions for trap words at the source |
| PreToolUse Hook | **before** Write/Edit | Pre-write warning with replacement suggestions |
| PostToolUse Hook | **after** Write/Edit | Post-write confirmation, integrates escalation system |
| CLI (`bin/scan.js`) | manual | Actively scan a file / directory / workspace, with JSON output |

**Escalation system**: warning intensity escalates as the same trap word recurs (L0→L1→L2→L3); persistent cross-file occurrences suggest adding a project-level rule. Stats persist under `$HOME/.semantic-linter/`.

## Installation

### Vercel Skills CLI

Vercel Skills CLI is a good fit when you want a reusable skill that is not tied to a specific AI tool. If you only want to try the lightweight single-file reference skill from this repository, use:

```bash
npx skills add SummerSec/semantic-linter --skill semantic-linter-shot
```

If the current session does not pick up the new skill immediately, restart your AI tool.

### Claude Code

If you want the full plugin experience in Claude Code, first add this repository as a plugin marketplace:

```bash
claude plugin marketplace add SummerSec/semantic-linter
```

Then install the plugin itself:

```bash
claude plugin install semantic-linter@summersec-semantic-linter
```

If the current session does not pick up the plugin immediately after installation, run:

```bash
/reload-plugins
```

When updating, refresh the marketplace cache first and then update the plugin:

```bash
# Refresh marketplace cache first, then update
claude plugin marketplace update summersec-semantic-linter
claude plugin update semantic-linter@summersec-semantic-linter
```

### Developer Install (Source)

If you prefer to work directly from source, or want a local development install, clone the repository into your Claude plugins directory:

```bash
git clone https://github.com/SummerSec/semantic-linter.git ~/.claude/plugins/semantic-linter
```

Then manually register it in `~/.claude/plugins/installed_plugins.json`:

```json
{
  "version": 2,
  "plugins": {
    "semantic-linter@summersec-semantic-linter": [
      {
        "scope": "user",
        "installPath": "/Users/<you>/.claude/plugins/semantic-linter",
        "version": "1.1.0"
      }
    ]
  }
}
```

On Windows, use `C:/Users/<you>/.claude/plugins/semantic-linter` as `installPath`.

After registration, restart Claude Code, or run `/reload-plugins`. To update a source install:

```bash
cd ~/.claude/plugins/semantic-linter
git pull
```

## What Gets Scanned

The linter activates on files matching these patterns:

| Pattern | Examples |
|---|---|
| File names | `skill.md`, `SKILL.md`, `claude.md`, `CLAUDE.md` |
| Suffixes | `*.prompt.md`, `*_definitions.md`, `*_examples.md` |
| Directories | `/skills/`, `/agents/`, `/commands/`, `/rules/`, `/prompts/` |

All other files are silently skipped.

## Project configuration (optional)

Place `.semantic-linter.json` in the repo or a parent directory. The linter walks **upward from the scanned file’s directory** and uses the nearest config file.

| Field | Purpose |
|-------|---------|
| `ignoreTrapIds` | Array of trap IDs to suppress (e.g. `["T01"]`) |
| `ignorePathSubstrings` | If the normalized path contains a substring, the **entire file** is skipped |
| `ignoreStructuralTypes` | e.g. `["open_ended_verb"]` to turn off specific structural rules |

UserPromptSubmit scans use the same config, discovered from **the current working directory** upward.

## State and privacy

Hooks and the CLI persist stats under the user home directory (override with `SEMANTIC_LINTER_STATE_DIR`):

- Default: `$HOME/.semantic-linter/` (Windows: `%USERPROFILE%\.semantic-linter\`)
- Files: `stats.json`, `session.json` — may include **paths of files that were scanned**
- **Detection counts are updated on PostToolUse** (and user-prompt scans), not on PreToolUse, so the same edit is not double-counted.

## Lexicon build

Authoritative table: `references/semantic-trap-lexicon.md`. After editing it:

```bash
npm run build-lexicon
npm test
```

Validate committed output without writing: `npm run build-lexicon:check`

## Constraint Rule Injection (model self-checks)

Beyond Hooks warning at write time, this plugin can write the semantic judgment standard **as constraint rules into CLAUDE.md**, so the model loads them every session and proactively narrows wide-boundary words while writing instruction files — the increment of "model-driven detection" over static lexicon matching.

The rule block (4-dimension standard + 27 "wide→narrow" quick-reference pairs + boundary-anchoring strategies + self-check instructions) is deterministically generated from the lexicon by `scripts/build-rules.js`, written into a managed region in CLAUDE.md (`<!-- STL:RULES:BEGIN -->` … `<!-- STL:RULES:END -->`), idempotently.

**Two ways to use it:**

```bash
# Developer (inside the repo source): inject/update the plugin's own CLAUDE.md
npm run build-rules
# Validate the managed region against the lexicon (run automatically by npm test via pretest)
npm run build-rules:check
```

**Installed users**: trigger the `rules-installer` skill in a session (e.g. "install semantic rules into CLAUDE.md"); it guides writing the rules into **your current project's** `CLAUDE.md`.

## CLI JSON output

`--json` includes `schemaVersion`, `version` (from root `package.json`), per-file `skipped` (path ignored by config), and `summary.filesSkipped`.

## Detection Pipeline

```
File Detection ──→ Content Scanning ──→ Structural Analysis ──→ Report
   (path match)     (lexicon match)     (pattern detection)    (markdown)
```

### Stage 1 — File Detection

Checks file path against known instruction-file patterns. Only `.md` files are considered.

### Stage 2 — Content Scanning

- Strips code blocks to prevent false positives
- Matches text against 27 trap word pairs (O(1) Map lookup)
- Classifies each match's context role:
  - **constraint_keyword** — highest risk (e.g. phrases with 只/必须/不得 + wide words)
  - **task_target** — medium risk (e.g. "please analyze …")
  - **auxiliary** — lower risk; a bare 不 is **not** treated as a constraint marker (reduces false positives)
- Deduplicates: each word reported only once per file

### Stage 3 — Structural Analysis

Detects four structural risk patterns:

| Risk Type | Example (Flagged) | Example (OK) |
|---|---|---|
| Open-ended verb | "Analyze the code" | "Analyze the code for the following aspects" |
| Abstract target | "Evaluate security" | "Detect vulnerabilities" |
| Modal downgrade | "should not" in constraints | "must not" in constraints |
| Missing negation | High-severity word, no exclusion list | Word + "excluding..." |

### Stage 4 — Report

Generates a structured Markdown report with:
- Overall risk level
- Trap words table (word, ID, severity, context, replacement, line number)
- Structural risks (type, context, suggestion)
- Action recommendations

## Severity Levels

```
critical > high > medium-high > medium > low
```

Severity is adjusted by context role:
- Constraint keyword: base severity (no change)
- Task target: base severity (no change)
- Auxiliary: downgraded by 1 level

## Example Output

```markdown
## Semantic Trap Detection Report

**File**: skills/code-review/skill.md
**Findings**: 2 trap words, 1 structural risk
**Overall Risk**: HIGH

### Trap Words

| # | Word | ID  | Severity | Context        | Replace With | Line |
|---|------|-----|----------|----------------|-------------|------|
| 1 | risk | E01 | critical | constraint_keyword | vulnerability | 12 |
| 2 | review | E02 | high   | task_target    | check        | 5  |

### Structural Risks

| Type | Scope | Context | Suggestion |
|------|-------|---------|------------|
| Open-ended verb | Line 8 | "Analyze the code" | Add scope limiters |
```

## Running Tests

```bash
npm test
```

Uses Node.js built-in `assert` (zero test framework dependencies), covering the detector, scanning, structural analysis, reporting, escalation, hooks, and generators. `npm test` runs `build-lexicon:check` and `build-rules:check` first via the `pretest` hook, ensuring generated artifacts never go stale.

## Project Structure

```
semantic-linter/
├── bin/scan.js                 # CLI active-scan entry
├── hooks/
│   ├── hooks.json              # Hook registration (4 events)
│   ├── session-start.js        # SessionStart: inject trap-word context
│   ├── prompt-scanner.js       # UserPromptSubmit: scan user instructions
│   ├── pre-tool-use.js         # PreToolUse: pre-write warning
│   └── semantic-linter.js      # PostToolUse: post-write confirm + escalation
├── lib/
│   ├── file-detector.js        # Stage 1: Path pattern matching
│   ├── content-scanner.js      # Stage 2: Lexicon matching + context
│   ├── lexicon-data.js         # Trap word database (27 pairs, generated)
│   ├── structural-analyzer.js  # Stage 3: Structural risk detection
│   ├── report-formatter.js     # Stage 4: Report generation
│   ├── state-manager.js        # State persistence + escalation system
│   ├── config-loader.js        # .semantic-linter.json loading
│   └── meta.js                 # Version metadata
├── scripts/
│   ├── build-lexicon.js        # Generate lexicon-data.js from MD
│   └── build-rules.js          # Generate constraint rules into CLAUDE.md
├── references/
│   └── semantic-trap-lexicon.md # Full lexicon documentation
├── skills/                     # semantic-analyzer / lexicon-manager /
│   │                           #   semantic-linter-shot / rules-installer
├── tests/                      # test-scanner.js + test-new-features.js
├── evals/                      # Annotated corpus + precision/recall benchmark
├── package.json
└── CLAUDE.md
```

## Design Decisions

1. **O(1) lexicon lookup** — Map-based, not linear search
2. **Context-aware severity** — Same word, different risk depending on sentence role
3. **Code block stripping** — No false positives from documentation examples
4. **Deduplication** — Each trap word reported once per file (`pairId:word` key)
5. **Graceful failure** — Hook always returns `continue: true`, never blocks Claude
6. **Separate language paths** — Chinese uses substring matching; English uses word-boundary regex

## License

MIT
