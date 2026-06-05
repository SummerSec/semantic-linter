# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在操作本代码仓库时的指导信息。

## 项目概述

**semantic-linter** 是一个 Claude Code Hook 插件，用于检测 Skill/Prompt/Agent 指令文件中的语义陷阱词汇。它可以识别语义边界过宽的词汇，这些词汇可能导致大模型产生幻觉（例如使用"风险"而非更精确的"漏洞"）。

## 常用命令

```bash
# 运行全部测试（pretest 自动先跑 build-lexicon:check + build-rules:check）
npm test

# CLI 主动扫描
npm run scan -- <file>          # 扫描单个文件
npm run scan -- <directory>     # 递归扫描目录
npm run scan -- --all           # 扫描当前目录
npm run scan -- --json <file>   # JSON 格式输出

# 评估基准测试（8 个语料文件，精确率/召回率）
npm run benchmark

# 从 semantic-trap-lexicon.md 生成 lib/lexicon-data.js
npm run build-lexicon
# 校验已生成词典与 Markdown 一致（不写盘）
npm run build-lexicon:check

# 运行单个测试文件
npm run test:legacy        # 仅核心功能测试（test-scanner.js）
npm run test:new           # 仅新功能测试（test-new-features.js）
```

## 架构概览

### 触发机制（4 Hook + CLI）

该工具提供五种触发方式：

1. **SessionStart Hook**（`hooks/session-start.js`）— 会话启动注入
   - 在会话启动/恢复/压缩时触发
   - 注入 `additionalContext`：旁白式 `STL：…` 短句，提醒常见陷阱词、Pre/Post 扫描范围及（如有）本会话命中与升级等级

2. **UserPromptSubmit Hook**（`hooks/prompt-scanner.js`）— 用户指令扫描
   - 在用户提交消息时触发（匹配所有消息）
   - 扫描用户指令文本中的陷阱词，防止模糊指令传递给 Claude
   - 生成旁白式 `STL：…` 单行串联提示（无 Markdown 表格）

3. **PreToolUse Hook**（`hooks/pre-tool-use.js`）— 写入前预警
   - 在 Write/Edit 操作**之前**触发
   - Write：扫描 `tool_input.content`
   - Edit：仅扫描 `tool_input.new_string`（文件尚未修改）
   - 指示 Claude 暂停、展示问题、提供替换方案、等待用户确认
   - 集成升级系统：同一陷阱词反复出现时升级警告强度

4. **PostToolUse Hook**（`hooks/semantic-linter.js`）— 写入后确认
   - 在 Write/Edit 操作**之后**触发
   - Write：扫描 `tool_input.content`
   - Edit：读取磁盘上的完整文件
   - 提示 Claude 告知用户检测结果并建议修复
   - 集成升级系统：追踪跨文件持续性陷阱词

5. **CLI 工具**（`bin/scan.js`）— 命令行主动扫描
   - 支持扫描单文件、目录、当前工作区
   - 终端彩色输出 + JSON 输出模式
   - 退出码：0=无问题, 1=有发现, 2=参数错误

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

4. **报告格式化** (`lib/report-formatter.js`) - 生成四种格式的报告：
   - `formatPre()` — PreToolUse 旁白式 `STL：…` 预警（串联多句，含替换理由与结构性风险旁白）
   - `format()` — PostToolUse 旁白式 `STL：…` 确认（同上）
   - `formatCli()` — CLI 终端彩色报告（仍为分行 ANSI 输出）
   - `formatPromptWarning()` — UserPromptSubmit 旁白式单行提示
   - `appendEscalationToReport()` — 将升级旁白拼接到 Pre/Post 的 `systemMessage` 末尾

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
- **SessionStart**：会话启动时注入陷阱词意识上下文
- **UserPromptSubmit**：用户消息中的陷阱词实时扫描
- **PreToolUse**：`Write|Edit` 操作前触发预警
- **PostToolUse**：`Write|Edit` 操作后触发确认
- 所有 Hook 均不阻断操作（`continue: true`），通过 `systemMessage`/`additionalContext` 主动提示

### 状态持久化

状态管理 (`lib/state-manager.js`) 持久化检测统计到 `~/.semantic-linter/`（可用 `SEMANTIC_LINTER_STATE_DIR` 覆盖）：
- `stats.json` — 累计陷阱词频率（永久保存）
- `session.json` — 当前会话状态（2 小时无活动自动重置）
- 支持升级系统：L0（正常）→ L1（同词 2 次）→ L2（同词 3+ 次）→ L3（跨 3+ 文件持续性）

### 评估基准

`evals/` 目录包含 8 个标注语料文件和基准测试运行器：
- `evals/corpus/` — 标注的测试语料（干净、单陷阱、多陷阱、代码块、双语、边界情况）
- `evals/expected.json` — 每个文件的预期结果
- `evals/run-benchmark.js` — 计算精确率、召回率、假阳性/假阴性率

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

### 词典生成流程

`scripts/build-lexicon.js` 将权威 Markdown 词典（`references/semantic-trap-lexicon.md`）解析并生成 `lib/lexicon-data.js`：
- `npm run build-lexicon` — 写入生成的 JS 文件
- `npm run build-lexicon:check` — 仅校验已生成文件与 Markdown 一致（CI 中使用）
- 解析规则：中文表 6 列（`| T01 | 窄边界词 | 宽边界词 | 严重等级 | 场景 |`），英文表 5 列（含 `/` 分隔的变体）
- `npm test` 通过 `pretest` 钩子自动先跑 `build-lexicon:check` 与 `build-rules:check`，确保生成的词典与 CLAUDE.md 受管区都不会过时

`.semantic-linter.json` 项目配置文件由 `lib/config-loader.js` 加载，从**被扫描文件所在目录向上**逐级查找：
- `ignoreTrapIds` — 按 ID 忽略指定陷阱词（如 `["T01", "E03"]`）
- `ignorePathSubstrings` — 路径子串命中则跳过整个文件
- `ignoreStructuralTypes` — 关闭指定结构规则（如 `["open_ended_verb"]`）
- UserPromptSubmit 扫描使用当前工作目录向上查找同一份配置文件

### 版本元数据

`lib/meta.js` 提供跨模块使用的版本信息：
- `getToolVersion()` — 读取根目录 `package.json` 的 `version` 字段，所有 hook/CLI 输出共用
- `JSON_SCHEMA_VERSION` — JSON 输出结构版本号，仅在字段含义变更时递增

### 主动提示机制

`systemMessage` / `additionalContext` 以旁白式 `STL：…` 为主，并在首句内嵌流程要求（先向用户展示、确认后再写入 / 写入后告知并询问是否修复）。

### 测试策略

测试使用 Node.js 内置的 `assert` 模块（零依赖），两个测试文件（运行 `npm test` 查看当前用例数；`pretest` 钩子先跑 build-lexicon:check + build-rules:check）：

`tests/test-scanner.js`（约 50 个测试）— 核心功能：
- 文件检测器测试：路径模式匹配
- 内容扫描器测试：词汇检测、代码块去除、上下文分类
- 结构分析器测试：4 种风险类型的模式检测
- 报告格式化器测试：Pre/Post/CLI 三种输出模式
- CLI 工具测试：文件扫描、目录扫描、JSON 输出、退出码

`tests/test-new-features.js`（约 38 个测试）— 新功能：
- 状态管理器测试：初始化、记录、统计、升级、容错
- SessionStart Hook 测试：输出格式、内容、降级
- UserPromptSubmit Hook 测试：检测、清洁输入、格式
- 升级系统测试：L0-L3 报告格式
- 元数据验证测试：plugin.json、基准语料

## 项目结构

```
semantic-linter/
├── bin/scan.js                  # CLI 主动扫描入口
├── hooks/                       # 4 个 Hook 脚本 + hooks.json 注册配置
│   ├── hooks.json               # Hook 事件注册（SessionStart/UserPromptSubmit/PreToolUse/PostToolUse）
│   ├── session-start.js         # SessionStart：注入陷阱词意识上下文
│   ├── prompt-scanner.js        # UserPromptSubmit：扫描用户指令中的陷阱词
│   ├── pre-tool-use.js          # PreToolUse：Write/Edit 前预警
│   └── semantic-linter.js       # PostToolUse：Write/Edit 后确认 + 升级记录
├── lib/                         # 核心检测库（零外部依赖）
│   ├── file-detector.js         # 阶段 1：基于路径模式的指令文件检测
│   ├── content-scanner.js       # 阶段 2：词典匹配 + 上下文角色分类
│   ├── lexicon-data.js          # 预编译陷阱词数据库（由 build-lexicon 生成）
│   ├── structural-analyzer.js   # 阶段 3：4 种结构性风险检测
│   ├── report-formatter.js      # 阶段 4：Pre/Post/CLI/Prompt 四种报告格式
│   ├── state-manager.js         # 状态持久化 + 升级系统（L0-L3）
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
├── evals/
│   ├── corpus/                  # 8 个标注语料文件
│   ├── expected.json            # 每个语料文件的预期结果
│   └── run-benchmark.js         # 基准测试运行器（精确率/召回率）
├── .claude-plugin/              # Claude Code 插件清单
│   ├── plugin.json              # 插件声明（hooks/skills 路径）
│   └── marketplace.json         # 市场条目元数据
├── .github/workflows/ci.yml     # CI：push/PR 时运行 npm test
└── docs/                        # 项目理论基础文章
```

## 关键设计决策

1. **上下文感知严重等级**：同一词汇根据句子中的角色具有不同的严重等级（约束关键词风险最高）

2. **代码块去除**：防止文档中的示例代码产生误报

3. **去重**：每个陷阱词汇在单个文件中仅报告一次（使用 `pairId:word` 作为 Set 的键）

4. **双语支持**：中文和英文使用独立的检测路径，各自拥有语言特定的标记词

5. **Pre/Post 双 Hook 互补**：PreToolUse 做写入前预警（Edit 时仅扫描新内容片段），PostToolUse 做写入后全文确认

6. **主动提示设计**：Hook 输出为旁白式 `STL：…` 串联，在首句内嵌「先展示、待确认」/「告知并询问修复」等流程要求，而非长 Markdown 表格

7. **状态持久化**：检测统计持久化到 `~/.semantic-linter/`（可用 `SEMANTIC_LINTER_STATE_DIR` 覆盖），支持跨会话累计和会话内升级

8. **升级系统**：同一陷阱词反复出现时逐级升级警告强度（L0-L3），跨文件持续出现时建议添加项目级规则；**仅在 PostToolUse（及 UserPromptSubmit）中 `recordDetection`**，PreToolUse 只读会话等级、不写入，避免同一轮编辑重复计数

9. **用户指令扫描**：UserPromptSubmit Hook 在用户消息到达模型前扫描陷阱词，从源头防止模糊指令

10. **项目配置与词典生成**：`.semantic-linter.json` 可选忽略规则（`lib/config-loader.js`）；`npm run build-lexicon` 从 `semantic-trap-lexicon.md` 生成 `lexicon-data.js`

## 检测的文件模式

Linter 对匹配以下模式的文件生效：
- 文件名：`skill.md`、`claude.md`（不区分大小写）
- 文件后缀：`.prompt.md`、`_definitions.md`、`_examples.md`
- 目录路径：`/skills/`、`/agents/`、`/commands/`、`/rules/`、`/prompts/`

<!-- STL:RULES:BEGIN -->
## 语义约束规则（自动生成，请勿手动编辑此区块）

> 本区块由 `npm run build-rules` 从语义陷阱词典生成，共 27 对陷阱词。
> 词典更新后重新运行生成器即可同步。

**适用场景**：编写或修改 skill / agent / command / rules / prompt 等**指令类文件**时。

**核心原理**：某些词在大模型语义空间中的激活范围（语义边界）远宽于日常含义。
宽边界词会让输出突破 Prompt 约束、产生超范围联想。下笔前主动识别并收窄。

### 判定一个词是否为陷阱（四维特征）

满足越多、边界越宽、越需替换：

1. **程度性 vs 二元性**：陷阱词偏程度连续（可大可小）；安全词偏是否、通过/不通过。
2. **展望性**：含「潜在」「可能」等拉远时间轴的成分。
3. **主观评价性**：判定依赖评判者标准，因人/场景而异。
4. **关联松散度**：联想网大、难以收敛到单一对象。

### 已知陷阱词速查（宽边界 → 窄边界，按严重度降序）

下笔时若用到「宽边界」一侧的词，优先替换为对应「窄边界」词；确需保留宽词时套用下方锚定策略。

中文：

| ID | 宽 → 窄（推荐） | 严重度 | 失控场景 |
|----|----------------|--------|---------|
| T01 | 风险 → **漏洞** | 极高 | "风险"激活代码质量、架构设计、性能等大量超范围联想 |
| T02 | 审查 → **检查** | 高 | "审查"触发主观评价性意见，"检查"仅触发通过/不通过判定 |
| T03 | 描述 → **列出** | 高 | "描述"触发解释和评论，"列出"仅产出结构化条目 |
| T04 | 问题 → **缺陷** | 高 | "问题"范围极宽，改进建议都会被归类为"问题" |
| T08 | 改善 → **修复** | 高 | "改善"触发优化建议、重构方案等超范围内容 |
| T10 | 评估 → **统计** | 高 | "评估"触发主观判断和权重分配，"统计"仅输出数值 |
| T11 | 理解 → **提取** | 高 | "理解"触发推断和解读，"提取"仅取出原文信息 |
| T14 | 洞察 → **报告** | 高 | "洞察"触发创造性推断，"报告"仅陈述发现 |
| T05 | 分析 → **总结** | 中高 | "分析"触发推理和假设，"总结"仅提炼已有信息 |
| T06 | 建议 → **要求** | 中高 | "建议"触发发散性思维，"要求"仅输出明确条件 |
| T09 | 参考 → **遵循** | 中高 | "参考"暗示可灵活解读，"遵循"要求严格执行 |
| T13 | 转化 → **复制** | 中高 | "转化"暗示允许改动，"复制"要求保持原样 |
| T15 | 评价 → **验证** | 中高 | "评价"触发主观打分和点评，"验证"仅做二元判定 |
| T07 | 异常 → **错误** | 中 | "异常"边界模糊，轻微偏差都可能被纳入报告 |
| T12 | 关联 → **匹配** | 中 | "关联"触发间接联系推理，"匹配"仅做精确对应 |
| T16 | 原则 → **规则** | 中 | "原则"暗示可灵活解读，"规则"要求严格遵守 |
| T17 | 方法 → **步骤** | 中 | "方法"暗示可选择多种路径，"步骤"要求按序执行 |

英文：

| ID | 宽 → 窄（推荐） | 严重度 | 失控场景 |
|----|----------------|--------|---------|
| E01 | Risk → **Vulnerability** | 极高 | 同T01 |
| E02 | Review → **Check** | 高 | "Review"和"Audit"触发全面评价 |
| E03 | Describe → **List** | 高 | "Describe"触发叙述性展开 |
| E04 | Issue → **Bug** | 高 | "Issue"覆盖面过宽 |
| E08 | Interpret → **Extract** | 高 | "Interpret"触发主观解读 |
| E05 | Analyze → **Summarize** | 中高 | "Analyze"触发深度推理 |
| E06 | Suggestion → **Requirement** | 中高 | "Recommendation"触发发散 |
| E09 | Evaluate → **Verify** | 中高 | "Evaluate"触发多维评价 |
| E10 | Should → **Must** | 中高 | "Should"暗示可选，"Must"要求强制 |
| E07 | Anomaly → **Error** | 中 | "Concern"几乎无边界 |

### 必须使用宽边界词时——边界锚定三策略

1. **前置否定清单**：在定义中明确排除不属于本任务范围的内容（"以下不属于评估范围：…"）。
2. **输出格式硬约束**：把输出设计成结构化填空/枚举，消除塞入额外内容的空间。
3. **反例强化**：示例中明确展示"看起来像但不属于"的反例及其判定。

### 自查指令

写指令类文件前，对照上表扫描关键动词/名词：
- 命中宽边界词 → 优先替换为窄边界词；
- 业务上必须用宽词 → 至少套用一条锚定策略；
- 表外但符合四维特征的可疑词 → 同样收窄，必要时反馈以纳入词典。
<!-- STL:RULES:END -->
