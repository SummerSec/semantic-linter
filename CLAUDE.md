# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在操作本代码仓库时的指导信息。

## 项目概述

**semantic-linter** 是一个 Claude Code Hook 插件，用于检测 Skill/Prompt/Agent 指令文件中的语义陷阱词汇。它可以识别语义边界过宽的词汇，这些词汇可能导致大模型产生幻觉（例如使用"风险"而非更精确的"漏洞"）。

## 常用命令

```bash
# 运行全部测试（80 个）
npm test

# CLI 主动扫描
npm run scan -- <file>          # 扫描单个文件
npm run scan -- <directory>     # 递归扫描目录
npm run scan -- --all           # 扫描当前目录
npm run scan -- --json <file>   # JSON 格式输出

# 评估基准测试（8 个语料文件，精确率/召回率）
npm run benchmark

# 从源码构建词典（如果 scripts/build-lexicon.js 存在）
npm run build-lexicon
```

## 架构概览

### 触发机制（4 Hook + CLI）

该工具提供五种触发方式：

1. **SessionStart Hook**（`hooks/session-start.js`）— 会话启动注入
   - 在会话启动/恢复/压缩时触发
   - 注入 `additionalContext`：提醒 Claude 常见陷阱词和 linter 活跃状态
   - 如有历史统计数据，展示 top 5 高频陷阱词和当前升级等级

2. **UserPromptSubmit Hook**（`hooks/prompt-scanner.js`）— 用户指令扫描
   - 在用户提交消息时触发（匹配所有消息）
   - 扫描用户指令文本中的陷阱词，防止模糊指令传递给 Claude
   - 生成简洁单段落警告（非完整表格）

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
   - `formatPre()` — PreToolUse 预警报告（含执行指令和替换方案）
   - `format()` — PostToolUse 确认报告（含修复建议）
   - `formatCli()` — CLI 终端彩色报告
   - `formatPromptWarning()` — UserPromptSubmit 简洁单段落警告

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

状态管理 (`lib/state-manager.js`) 持久化检测统计到 `~/.semantic-linter/`：
- `stats.json` — 累计陷阱词频率（永久保存）
- `session.json` — 当前会话状态（2 小时无活动自动重置）
- 支持升级系统：L0（正常）→ L1（同词 2 次）→ L2（同词 3+ 次）→ L3（跨 3+ 文件持续性）

### 评估基准

`evals/` 目录包含 8 个标注语料文件和基准测试运行器：
- `evals/corpus/` — 标注的测试语料（干净、单陷阱、多陷阱、代码块、双语、边界情况）
- `evals/expected.json` — 每个文件的预期结果
- `evals/run-benchmark.js` — 计算精确率、召回率、假阳性/假阴性率

### Skill 集成

`plugin/skills/semantic-analyzer/SKILL.md` — 实时语义分析 skill（第 3 层防线）：
- 超越固定词典，利用 Claude 语义理解动态发现新陷阱词
- 四维评分体系：程度性、展望性、主观评价性、关联松散度（0-12 分）
- 上下文风险增强分析：语义叠加、隐式宽边界、否定句反转
- 新发现的高频词可通过 lexicon-manager 收录到词典

`plugin/skills/lexicon-manager/SKILL.md` — 词典维护 skill：
- 交互式添加、修改、删除语义陷阱词汇对
- 自动同步 `lexicon-data.js` 和 `semantic-trap-lexicon.md`
- 字段验证（ID 唯一性、severity 合法性等）
- 修改后自动运行 `npm test` 验证

`plugin/skills/semantic-linter-shot/SKILL.md` — 轻量级单文件 skill（Shot 模式）：
- 自包含的语义陷阱词参考卡，无需安装完整插件
- 包含完整 27 对陷阱词表格和 4 种结构风险描述
- 适用于快速采用和入门用户

### 主动提示机制

systemMessage 包含明确的执行指令：
- PreToolUse：要求 Claude 暂停写入、展示问题、提供替换方案、等待用户确认
- PostToolUse：要求 Claude 告知用户检测结果并询问是否修复

### 测试策略

测试使用 Node.js 内置的 `assert` 模块（零依赖），共 80 个测试（两个测试文件）：

`tests/test-scanner.js`（47 个测试）— 核心功能：
- 文件检测器测试：路径模式匹配
- 内容扫描器测试：词汇检测、代码块去除、上下文分类
- 结构分析器测试：4 种风险类型的模式检测
- 报告格式化器测试：Pre/Post/CLI 三种输出模式
- CLI 工具测试：文件扫描、目录扫描、JSON 输出、退出码

`tests/test-new-features.js`（33 个测试）— 新功能：
- 状态管理器测试：初始化、记录、统计、升级、容错
- SessionStart Hook 测试：输出格式、内容、降级
- UserPromptSubmit Hook 测试：检测、清洁输入、格式
- 升级系统测试：L0-L3 报告格式
- 元数据验证测试：plugin.json、基准语料

## 关键设计决策

1. **上下文感知严重等级**：同一词汇根据句子中的角色具有不同的严重等级（约束关键词风险最高）

2. **代码块去除**：防止文档中的示例代码产生误报

3. **去重**：每个陷阱词汇在单个文件中仅报告一次（使用 `pairId:word` 作为 Set 的键）

4. **双语支持**：中文和英文使用独立的检测路径，各自拥有语言特定的标记词

5. **Pre/Post 双 Hook 互补**：PreToolUse 做写入前预警（Edit 时仅扫描新内容片段），PostToolUse 做写入后全文确认

6. **主动提示设计**：systemMessage 使用指令式语言要求 Claude 暂停并主动通知用户，而非被动注入上下文

7. **状态持久化**：检测统计持久化到 `~/.semantic-linter/`，支持跨会话累计和会话内升级

8. **升级系统**：同一陷阱词反复出现时逐级升级警告强度（L0-L3），跨文件持续出现时建议添加项目级规则

9. **用户指令扫描**：UserPromptSubmit Hook 在用户消息到达模型前扫描陷阱词，从源头防止模糊指令

## 检测的文件模式

Linter 对匹配以下模式的文件生效：
- 文件名：`skill.md`、`claude.md`（不区分大小写）
- 文件后缀：`.prompt.md`、`_definitions.md`、`_examples.md`
- 目录路径：`/skills/`、`/agents/`、`/commands/`、`/rules/`、`/prompts/`
