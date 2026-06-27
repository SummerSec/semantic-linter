[English Version](./README.en.md)

# Semantic-Linter

Semantic-Linter 是一个面向 LLM 指令文件的插件与 CLI，用来收窄语义边界过宽的表达。它主要用于 `SKILL.md`、`AGENTS.md`、`CLAUDE.md`、prompt 文档、command 文档等指令资产，帮助减少因为措辞过宽带来的幻觉和范围漂移。

## 当前架构

Semantic-Linter 现在使用分层设计，不再是旧的 pointer-only 方案：

- `SessionStart` 注入一条紧凑的 `STL:` 规则指针，指向当前生效的 `semantic-rules.md`
- `SubagentStart` 把同样的规则指针传播给子代理
- `UserPromptSubmit` 可以在提示词进入模型前提醒宽边界表达
- `PreToolUse` 会在 `Write` 和 `Edit` 修改指令文件前给出预警
- `PostToolUse` 会在写入后再次检查结果，并记录升级状态
- `bin/scan.js` 仍然保留为显式 CLI 扫描入口，可扫描单文件、目录或当前工作区

默认运行模式是 `guarded`：

- `off`：关闭 semantic-linter
- `pointer`：只保留轻量规则指针
- `guarded`：规则指针 + 写入期检查
- `strict`：规则指针 + 写入期检查 + prompt 扫描

## 规则来源策略

默认使用 `project-first` 规则解析策略：

1. 从当前编辑文件或工作区开始，向上查找最近的 `semantic-rules.md`
2. 如果项目内没有，则回退到插件自带的 `semantic-rules.md`

你也可以通过 `.semantic-linter.json` 强制使用 `plugin-only`。

## 安装

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

Codex 不直接消费 Claude 的 hook manifest。它的项目级接入方式是把受管规则块写入 `AGENTS.md`。

## 项目初始化

如果你想把项目本地规则注入到当前仓库，可以运行：

```bash
node /absolute/path/to/semantic-linter/scripts/build-rules.js --existing "$(pwd)"
```

这会生成：

- `semantic-rules.md`
- `AGENTS.md` 和或 `CLAUDE.md` 中的受管规则区块

如果两个文件都不存在，脚本会根据宿主环境创建默认目标：

- Codex 或 auto：`AGENTS.md`
- Claude：`CLAUDE.md`

常用命令：

```bash
npm run build-rules
npm run build-rules:check
npm run build-lexicon
npm run build-lexicon:check
npm run scan -- <file>
npm test
```

## 配置

可选配置文件为 `.semantic-linter.json`。

支持的字段：

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

说明：

- `defaultMode` 支持 `off`、`pointer`、`guarded`、`strict`
- `ruleSource` 支持 `project-first` 和 `plugin-only`
- `enablePromptScan` 会在 `guarded` 模式下启用 `UserPromptSubmit`
- `strict` 会始终开启 prompt 扫描

## 检测范围

Semantic-Linter 会按路径约定扫描指令类文件：

- 文件名：`SKILL.md`、`AGENTS.md`、`CLAUDE.md`
- 后缀：`*.prompt.md`、`*_definitions.md`、`*_examples.md`
- 目录：`skills/`、`agents/`、`commands/`、`rules/`、`prompts/`

## 开发说明

核心运行时文件：

- `hooks/session-start.js`
- `hooks/subagent-start.js`
- `hooks/user-prompt-submit.js`
- `hooks/pre-tool-use.js`
- `hooks/post-tool-use.js`
- `hooks/config.js`
- `hooks/runtime.js`
- `hooks/rules-resolver.js`

核心库文件：

- `lib/content-scanner.js`
- `lib/structural-analyzer.js`
- `lib/report-formatter.js`
- `lib/state-manager.js`
- `lib/config-loader.js`

## 测试

```bash
npm test
```

`npm test` 会依次运行：

- `build-lexicon:check`
- `build-rules:check`
- `tests/test-scanner.js`
- `tests/test-new-features.js`

测试覆盖扫描器行为、生成器幂等性、manifest 一致性，以及基于 stdin 的 hook 入口行为。
