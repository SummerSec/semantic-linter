# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在操作本代码仓库时的指导信息。

## 项目概述

**semantic-linter** 是一个面向 Claude Code 与 Codex 的语义约束插件/CLI，用于检测 Skill/Prompt/Agent 指令文件中的语义陷阱词汇。它可以识别语义边界过宽的词汇，这些词汇可能导致大模型产生幻觉（例如使用"风险"而非更精确的"漏洞"）。

## 常用命令

```bash
# 运行全部测试（pretest 自动先跑 build-lexicon:check + build-rules:check）
npm test

# CLI 主动扫描
npm run scan -- <file>          # 扫描单个文件
npm run scan -- <directory>     # 递归扫描目录
npm run scan -- --all           # 扫描当前目录
npm run scan -- --json <file>   # JSON 格式输出

# 从 semantic-trap-lexicon.md 生成 lib/lexicon-data.js
npm run build-lexicon
# 校验已生成词典与 Markdown 一致（不写盘）
npm run build-lexicon:check

# 运行单个测试文件
npm run test:legacy        # 仅核心功能测试（test-scanner.js）
npm run test:new           # 仅新功能测试（test-new-features.js）
```

## 版本管理

- **默认用小版本迭代**：常规功能新增、修复、文档与重构均递增 **patch / minor**（如 1.3.0 → 1.3.1 或 1.4.0），不轻易升 major。
- 仅当出现面向用户的**破坏性变更**时才升 major（如插件用法、配置格式、CLI 接口不兼容）。
- 版本号四处需同步：`package.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`.codex-plugin/plugin.json`；`npm test` 含一致性校验。

## 架构概览

### 触发机制（1 Hook + CLI）

该工具提供两种触发方式：

1. **SessionStart Hook**（`hooks/session-start.js`）— 会话启动注入指针
   - 在会话启动/恢复/压缩时触发
   - 注入 `additionalContext`：旁白式 `STL：…`，给出插件自带 `semantic-rules.md` 的绝对路径与「何时去读」，引导模型在编写指令类文件时按需打开该文件、收窄宽边界词
   - 规则全文不常驻上下文，仅注入指针（与「按需加载」设计一致）

2. **CLI 工具**（`bin/scan.js`）— 命令行主动扫描
   - 支持扫描单文件、目录、当前工作区
   - 终端彩色输出 + JSON 输出模式
   - 退出码：0=无问题, 1=有发现, 2=参数错误

> 历史说明：早期版本曾提供 UserPromptSubmit / PreToolUse / PostToolUse 三个写入时扫描 hook 与 L0-L3 状态升级系统；现已移除，改为「会话启动注入指针 + 模型按需自查 + CLI 手动扫描」。`lib/` 下的检测核心（content-scanner / structural-analyzer / report-formatter / state-manager）保留，供 CLI 复用。

### 核心检测流程

该 Linter 在扫描文件时遵循 4 阶段流水线：

1. **文件检测** (`lib/file-detector.js`) - 基于路径模式判断文件是否为 LLM 指令文件（skill.md、/skills/、/agents/、/rules/ 等目录下的文件）

2. **内容扫描** (`lib/content-scanner.js`) - 扫描文本中的语义陷阱词汇：
   - 去除代码块 (```...```) 和行内代码 (`...`)，避免示例代码产生误报
   - 匹配 17 个中文和 10 个英文宽边界词汇对
   - 分类上下文角色：`constraint_keyword`（最高风险）、`task_target`（中等）或 `auxiliary`（辅助）
   - 根据上下文调整严重等级

3. **结构分析** (`lib/structural-analyzer.js`) - 检测 4 种结构性风险模式：
   - **开放式动词**：缺少范围限定的"分析/Analyze"
   - **抽象化目标**："评估安全性"等抽象目标
   - **情态动词降级**：约束条件中使用弱情态词（"应该/should"）
   - **缺少否定清单**：使用高严重级别的宽边界词但未列出排除项

4. **报告格式化** (`lib/report-formatter.js`) - 供 CLI 与（保留的）格式化函数使用：
   - `formatCli()` — CLI 终端彩色报告（分行 ANSI 输出）
   - `formatPre()` / `format()` / `formatPromptWarning()` / `appendEscalationToReport()` — 旁白式 `STL：…` 格式化函数，原为已移除的写入时 hook 服务，现作为库函数保留（被单测覆盖，未来可复用）

### 词典数据结构

语义陷阱词典 (`lib/lexicon-data.js`) 使用 Map 实现 O(1) 查找：

```javascript
// 中文：宽边界词 → 词汇对数据
wideWordsZh: Map {
  '风险' → { id: 'T01', narrow: '漏洞', severity: 'critical', ... }
}

// 英文：小写宽边界词 → 词汇对数据
wideWordsEn: Map {
  'risk' → { id: 'E01', narrow: 'Vulnerability', ... }
}
```

严重等级顺序：`critical` > `high` > `medium-high` > `medium` > `low`

### Hook 集成

该工具通过 `hooks/hooks.json` 与 Claude Code 集成：
- **SessionStart**：会话启动/恢复/压缩时注入语义约束规则指针（`semantic-rules.md` 路径 + 何时去读）
- Hook 不阻断操作（`continue: true`），通过 `additionalContext` 注入

### 状态持久化

状态管理 (`lib/state-manager.js`) 持久化检测统计到 `~/.semantic-linter/`（可用 `SEMANTIC_LINTER_STATE_DIR` 覆盖），供 CLI 扫描使用：
- `stats.json` — 累计陷阱词频率（永久保存）
- `session.json` — 当前会话状态（2 小时无活动自动重置）

### Skill 集成

`skills/semantic-analyzer/SKILL.md` — 实时语义分析 skill（第 3 层防线）：
- 超越固定词典，利用 Claude 语义理解动态发现新陷阱词
- 四维评分体系：程度性、展望性、主观评价性、关联松散度（0-12 分）
- 上下文风险增强分析：语义叠加、隐式宽边界、否定句反转
- 新发现的高频词可通过 lexicon-manager 收录到词典

`skills/lexicon-manager/SKILL.md` — 词典维护 skill：
- 交互式添加、修改、删除语义陷阱词汇对
- 自动同步 `lexicon-data.js` 和 `semantic-trap-lexicon.md`
- 字段验证（ID 唯一性、severity 合法性等）
- 修改后自动运行 `npm test` 验证

`skills/semantic-linter-shot/SKILL.md` — 轻量级单文件 skill（Shot 模式）：
- 自包含的语义陷阱词参考卡，无需安装完整插件
- 包含完整 27 对陷阱词表格和 4 种结构风险描述
- 适用于快速采用和入门用户

`plugin/skills/semantic-analyzer/references/report-template.md` — 插件侧语义分析报告模板。

### 插件清单

`.claude-plugin/` 目录包含 Claude Code 插件系统的发现入口：
- `plugin.json` — 插件声明（名称、版本、hooks 路径 `./hooks/hooks.json`、skills 路径 `./skills/`）
- `marketplace.json` — 插件市场条目元数据（分类、主页、来源路径）

`.codex-plugin/` 与 `.agents/plugins/` 目录包含 Codex 插件系统入口：
- `.codex-plugin/plugin.json` — Codex 插件声明（skills 路径 `./skills/` + interface 元数据；不要写 Claude-only `hooks` / `commands` 字段）
- `.agents/plugins/marketplace.json` — repo-local Codex marketplace，`source.path` 指向仓库根目录 `.`

### 词典生成流程

`scripts/build-lexicon.js` 将权威 Markdown 词典（`references/semantic-trap-lexicon.md`）解析并生成 `lib/lexicon-data.js`：
- `npm run build-lexicon` — 写入生成的 JS 文件
- `npm run build-lexicon:check` — 仅校验已生成文件与 Markdown 一致（CI 中使用）
- 解析规则：中文表 6 列（`| T01 | 窄边界词 | 宽边界词 | 严重等级 | 场景 |`），英文表 5 列（含 `/` 分隔的变体）
- `npm test` 通过 `pretest` 钩子自动先跑 `build-lexicon:check` 与 `build-rules:check`，确保生成的词典、CLAUDE.md 受管区与 AGENTS.md 受管区都不会过时

`.semantic-linter.json` 项目配置文件由 `lib/config-loader.js` 加载，从**被扫描文件所在目录向上**逐级查找：
- `ignoreTrapIds` — 按 ID 忽略指定陷阱词（如 `["T01", "E03"]`）
- `ignorePathSubstrings` — 路径子串命中则跳过整个文件
- `ignoreStructuralTypes` — 关闭指定结构规则（如 `["open_ended_verb"]`）
- CLI 扫描使用被扫描文件所在目录向上查找同一份配置文件

### 版本元数据

`lib/meta.js` 提供跨模块使用的版本信息：
- `getToolVersion()` — 读取根目录 `package.json` 的 `version` 字段，所有 hook/CLI 输出共用
- `JSON_SCHEMA_VERSION` — JSON 输出结构版本号，仅在字段含义变更时递增

### 主动提示机制

SessionStart 通过 `additionalContext` 注入旁白式 `STL：…` 指针，给出 `semantic-rules.md` 路径与「何时去读」；CLI 输出为分行 ANSI 报告。

### 测试策略

测试使用 Node.js 内置的 `assert` 模块（零依赖），两个测试文件（运行 `npm test` 查看当前用例数；`pretest` 钩子先跑 build-lexicon:check + build-rules:check）：

`tests/test-scanner.js`（约 50 个测试）— 核心功能：
- 文件检测器测试：路径模式匹配
- 内容扫描器测试：词汇检测、代码块去除、上下文分类
- 结构分析器测试：4 种风险类型的模式检测
- 报告格式化器测试：CLI / 旁白式输出
- CLI 工具测试：文件扫描、目录扫描、JSON 输出、退出码

`tests/test-new-features.js` — 新功能：
- 状态管理器测试：初始化、记录、统计、容错
- SessionStart Hook 测试：指针注入格式、规则文件路径
- build-rules 双文件测试：指针 + semantic-rules.md、--check、幂等
- slash 命令测试：commands 注册、命令文件不含陷阱词
- 元数据验证测试：plugin.json、版本一致性

## 项目结构

```
semantic-linter/
├── bin/scan.js                  # CLI 主动扫描入口
├── AGENTS.md                    # Codex 项目级指令文件（规则指针受管区）
├── commands/                    # slash 命令：stl-init / stl-rules / stl-lexicon
├── hooks/                       # SessionStart hook + hooks.json 注册配置
│   ├── hooks.json               # Hook 事件注册（仅 SessionStart）
│   └── session-start.js         # SessionStart：注入语义约束规则指针
├── lib/                         # 核心检测库（零外部依赖）
│   ├── file-detector.js         # 阶段 1：基于路径模式的指令文件检测
│   ├── content-scanner.js       # 阶段 2：词典匹配 + 上下文角色分类
│   ├── lexicon-data.js          # 预编译陷阱词数据库（由 build-lexicon 生成）
│   ├── structural-analyzer.js   # 阶段 3：4 种结构性风险检测
│   ├── report-formatter.js      # CLI / 旁白式报告格式化
│   ├── state-manager.js         # CLI 状态持久化
│   ├── config-loader.js         # .semantic-linter.json 项目配置加载
│   └── meta.js                  # 版本号 + JSON schema 版本
├── scripts/build-lexicon.js     # 从 references/ 的 MD 生成 lexicon-data.js
├── references/                  # 权威词典源文件
│   └── semantic-trap-lexicon.md # 27 组陷阱词的权威 Markdown 定义
├── skills/                      # 插件 Skill 文件（plugin.json 指向此处）
│   ├── semantic-analyzer/       # 第 3 层语义分析 skill
│   ├── lexicon-manager/         # 词典维护 skill
│   └── semantic-linter-shot/    # 轻量级单文件 skill
├── plugin/                      # 额外插件资源
│   ├── lib/                     # 插件侧 lib 副本（config-loader.js、meta.js）
│   └── skills/semantic-analyzer/references/  # 报告模板
├── tests/
│   ├── test-scanner.js          # 核心功能测试（~50 个用例）
│   ├── test-new-features.js     # 新功能测试（~38 个用例）
│   └── fixtures/                # 测试用 sample skill 文件
├── .claude-plugin/              # Claude Code 插件清单
│   ├── plugin.json              # 插件声明（hooks/skills 路径）
│   └── marketplace.json         # 市场条目元数据
├── .codex-plugin/               # Codex 插件清单
│   └── plugin.json              # 插件声明（skills 路径 + interface 元数据）
├── .agents/plugins/             # Codex repo-local marketplace
│   └── marketplace.json         # marketplace 条目，source.path 指向仓库根
├── .github/workflows/ci.yml     # CI：push/PR 时运行 npm test
└── docs/                        # 项目理论基础文章
```

## 关键设计决策

1. **上下文感知严重等级**：同一词汇根据句子中的角色具有不同的严重等级（约束关键词风险最高）

2. **代码块去除**：防止文档中的示例代码产生误报

3. **去重**：每个陷阱词汇在单个文件中仅报告一次（使用 `pairId:word` 作为 Set 的键）

4. **双语支持**：中文和英文使用独立的检测路径，各自拥有语言特定的标记词

5. **会话启动注入指针**：SessionStart 注入 `semantic-rules.md` 路径 + 何时去读，规则全文按需加载，不常驻上下文

6. **主动提示设计**：注入内容为旁白式 `STL：…`，简短指引而非长 Markdown 表格

7. **状态持久化**：CLI 检测统计持久化到 `~/.semantic-linter/`（可用 `SEMANTIC_LINTER_STATE_DIR` 覆盖）

8. **规则双文件外置**：`build-rules.js` 从词典生成 `semantic-rules.md`（规则全文）+ 项目指令文件指针（Codex: `AGENTS.md`；Claude Code: `CLAUDE.md`）；指针措辞避开陷阱词，规则文件不放指令目录以免被自身扫描

9. **slash 命令薄封装**：`/stl-init`、`/stl-rules`、`/stl-lexicon` 包装底层 skill 与脚本，负责好记好触发

10. **项目配置与词典生成**：`.semantic-linter.json` 可选忽略规则（`lib/config-loader.js`）；`npm run build-lexicon` 从 `semantic-trap-lexicon.md` 生成 `lexicon-data.js`

## 检测的文件模式

Linter 对匹配以下模式的文件生效：
- 文件名：`skill.md`、`agents.md`、`claude.md`（不区分大小写）
- 文件后缀：`.prompt.md`、`_definitions.md`、`_examples.md`
- 目录路径：`/skills/`、`/agents/`、`/commands/`、`/rules/`、`/prompts/`

<!-- STL:RULES:BEGIN -->
## 语义约束规则（核心原&#21017;）

> 本区块由 `npm run build-rules` 生成，请勿编辑。

产出 skill / agent / command / prompt 等指令文本前，先读同目录 `semantic-rules.md`（27 对宽→窄词 + 四维判定）；对即将输出的用词逐项自查，主动避开语义陷阱。必须保留宽词时，套用其中的边界锚定策略。
<!-- STL:RULES:END -->
