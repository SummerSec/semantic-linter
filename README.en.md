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

semantic-linter helps catch these traps while you write instruction files through project-level rule pointers and CLI scans.

## Features

- **27 semantic trap pairs**: 17 Chinese + 10 English, each with severity rating and replacement suggestion
- **Context-aware severity**: The same word gets different risk levels depending on its role (constraint keyword > task target > auxiliary)
- **4 structural risk detectors**: Open-ended verbs, abstract targets, modal downgrades, missing negation lists
- **Code block exclusion**: Skips ```` ``` ```` fenced blocks and `` ` `` inline code to avoid false positives
- **Bilingual**: Full Chinese and English support with language-specific detection strategies
- **Zero dependencies**: Pure Node.js, no npm install needed
- **Non-blocking**: Never interrupts Vibe Coding Tools workflows — it provides lightweight pointers and CLI reports

### Two trigger points

| Trigger | When | Purpose |
|---|---|---|
| SessionStart Hook | session start / resume / compact | Inject a **pointer** to the semantic rules: the path to the bundled `semantic-rules.md` plus when to read it, guiding the model to self-check and narrow wide-boundary words while writing instruction files |
| CLI (`bin/scan.js`) | manual | Actively scan a file / directory / workspace, with JSON output |

> Design stance: a **session-start pointer + on-demand rule reading** replaces per-write scan warnings — the full ruleset never stays resident in context, loaded only when writing instruction files. Use the CLI for explicit per-file checks.

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

### Codex

This repository also ships a Codex plugin manifest at `.codex-plugin/plugin.json` and a local marketplace entry at `.agents/plugins/marketplace.json`.

For local development install:

```bash
codex plugin marketplace add /absolute/path/to/semantic-linter
codex plugin add semantic-linter@summersec-semantic-linter
```

For GitHub install:

```bash
codex plugin marketplace add SummerSec/semantic-linter
codex plugin add semantic-linter@summersec-semantic-linter
```

Codex uses `AGENTS.md` as the project-level instruction file. To install the semantic rule pointer into the current project:

```bash
node /absolute/path/to/semantic-linter/scripts/build-rules.js "$(pwd)/AGENTS.md"
```

This generates/updates `semantic-rules.md` and the managed pointer in `AGENTS.md`; Codex can then open the rules file on demand when writing instruction files.

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

## Quick Start (first use)

After installing the plugin, just follow three steps the first time:

1. **Initialize**: run `/stl-init`, or run `build-rules.js` directly. It checks the plugin and lays the semantic rules into the current project (Codex: `semantic-rules.md` + `AGENTS.md` pointer; Claude Code: `semantic-rules.md` + `CLAUDE.md` pointer).
2. **Self-check afterward**: when you later write or edit instruction files (`/skills/`, `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, …), the model reads the project pointer and opens the rules file on demand; use the CLI for explicit per-file checks.
3. **Maintain on demand**: after the lexicon changes, run `/stl-rules` to regenerate this project's rules; use `/stl-lexicon` to add/edit trap word pairs.

### Quick commands

| Command | Purpose |
|---|---|
| `/stl-init` | First-use wizard: check install + lay rules into the current project + explain how it auto-applies |
| `/stl-rules` | Generate/update `semantic-rules.md` and the `AGENTS.md`/`CLAUDE.md` pointer in the current project (rerun after lexicon changes) |
| `/stl-lexicon` | Maintain the trap-word lexicon: add/edit/remove pairs, adjust severity, and regenerate runtime data |

> Commands are thin wrappers over the `rules-installer` / `lexicon-manager` skills and the `build-rules` script — they exist to be memorable and easy to trigger; you can still trigger the underlying skills via natural language.

## What Gets Scanned

The linter activates on files matching these patterns:

| Pattern | Examples |
|---|---|
| File names | `skill.md`, `SKILL.md`, `agents.md`, `AGENTS.md`, `claude.md`, `CLAUDE.md` |
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

CLI scans (`bin/scan.js`) use `.semantic-linter.json`, discovered from the scanned file's directory upward.

## State and privacy

The CLI (`bin/scan.js`) persists stats under the user home directory (override with `SEMANTIC_LINTER_STATE_DIR`):

- Default: `$HOME/.semantic-linter/` (Windows: `%USERPROFILE%\.semantic-linter\`)
- Files: `stats.json`, `session.json` — may include **paths of files that were scanned**

## Lexicon build

Authoritative table: `references/semantic-trap-lexicon.md`. After editing it:

```bash
npm run build-lexicon
npm test
```

Validate committed output without writing: `npm run build-lexicon:check`

## Constraint Rule Injection (on-demand self-check)

Beyond explicit CLI scans, this plugin can generate the semantic judgment standard **as a rules file** and keep only a **pointer** resident in the project-level instruction file (Codex: `AGENTS.md`; Claude Code: `CLAUDE.md`) — the model loads just that lightweight pointer every session, then **opens the rules file on demand** when writing instruction files to proactively narrow wide-boundary words. This is the increment of "model-driven detection" over static lexicon matching, without the full ruleset consuming context every session.

`scripts/build-rules.js` deterministically generates the rules file and project instruction pointers from the lexicon (idempotent):

- **`semantic-rules.md`** (next to the target instruction file) — the full ruleset: 4-dimension standard + 27 "wide→narrow" quick-reference pairs + boundary-anchoring strategies + self-check instructions;
- **Project instruction managed region** (Codex: `AGENTS.md`; Claude Code: `CLAUDE.md`; marker: `<!-- STL:RULES:BEGIN -->` … `<!-- STL:RULES:END -->`) — a pointer + scenario blurb telling the model when to read the rules file. Its wording deliberately avoids trap words, so it never triggers a self-scan false positive.

**Two ways to use it:**

```bash
# Developer (inside the repo source): generate/update the plugin's rules file plus CLAUDE.md / AGENTS.md pointers
npm run build-rules
# Validate the rules file and both project pointers against the lexicon (run automatically by npm test via pretest)
npm run build-rules:check
```

**Installed users**: trigger the `rules-installer` skill in a session (e.g. "install semantic rules into AGENTS.md / CLAUDE.md"); it guides generating `semantic-rules.md` and writing the pointer into **your current project**.

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
├── commands/                   # slash commands: stl-init / stl-rules / stl-lexicon
├── .codex-plugin/
│   └── plugin.json             # Codex plugin manifest (skills + UI metadata)
├── .agents/plugins/
│   └── marketplace.json        # Codex local marketplace entry
├── hooks/
│   ├── hooks.json              # Hook registration (SessionStart only)
│   └── session-start.js        # SessionStart: inject semantic-rules pointer
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
│   └── build-rules.js          # Generate rules file + project instruction pointer
├── references/
│   └── semantic-trap-lexicon.md # Full lexicon documentation
├── semantic-rules.md           # Generated: full constraint ruleset (project pointer targets it)
├── skills/                     # semantic-analyzer / lexicon-manager /
│   │                           #   semantic-linter-shot / rules-installer
├── tests/                      # test-scanner.js + test-new-features.js
├── package.json
├── AGENTS.md
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
