[English Version](./README.en.md)

# semantic-linter

一个 Vibe Coding Tools Hook 插件，用于检测 Skill / Prompt / Agent 指令文件中的**语义陷阱词汇**——语义边界过宽、可能导致大模型产生幻觉的词汇。

> 在同一个 Skill 中，仅将"漏洞"替换为"风险"，即使约束条件和逻辑完全相同，准确率也会**下降 27%**。

本项目基于文章[《别让大模型"想太多"：SKILL开发中的语义陷阱与抗幻觉设计》](https://sumsec.me/2026/%E5%88%AB%E8%AE%A9%E5%A4%A7%E6%A8%A1%E5%9E%8B_%E6%83%B3%E5%A4%AA%E5%A4%9A_%EF%BC%9ASKILL%E5%BC%80%E5%8F%91%E4%B8%AD%E7%9A%84%E8%AF%AD%E4%B9%89%E9%99%B7%E9%98%B1%E4%B8%8E%E6%8A%97%E5%B9%BB%E8%A7%89%E8%AE%BE%E8%AE%A1.html)的理论框架演化而来，将文中提出的语义陷阱检测方法实现为自动化工具。

## 问题背景

在 LLM 指令文件中，有些词汇对在人类看来近乎同义，但在模型语义空间中激活的区域截然不同：

| 宽边界词（高风险） | 窄边界词（精确） | 风险原因 |
|---|---|---|
| 风险 | 漏洞 | "风险"会激活金融、健康、法律等联想——模型注意力发散 |
| 审查 | 检查 | "审查"暗示主观评价——模型幻觉出个人观点 |
| 问题 | 缺陷 | "问题"激活争议/论辩语义——模型偏离主题 |
| 分析 | 总结 | "分析"缺乏边界——模型产出无限制的内容 |

semantic-linter 在每次编辑指令文件时**自动捕获**这些陷阱。

## 功能特性

- **27 组语义陷阱词对**：17 组中文 + 10 组英文，每组附带严重等级和替换建议
- **上下文感知严重等级**：同一词汇在不同角色中风险不同（约束关键词 > 任务目标 > 辅助描述）
- **4 种结构性风险检测**：开放式动词、抽象化目标、情态动词降级、缺少否定清单
- **代码块排除**：跳过 ```` ``` ```` 围栏代码块和 `` ` `` 行内代码，避免误报
- **双语支持**：中文和英文各自采用语言特定的检测策略
- **零依赖**：纯 Node.js 实现，无需 npm install
- **非阻塞**：从不中断 Vibe Coding Tools 工作流——发现的问题以警告形式注入

## 安装

### Vercel Skills CLI

Vercel Skills CLI 适合用来安装可复用的通用 Skill，不绑定某个特定 AI 工具。如果你只想先体验本仓库提供的单文件参考 Skill，可以使用下面这条命令：

```bash
npx skills add SummerSec/semantic-linter --skill semantic-linter-shot
```

如果当前会话没有立刻识别到新 Skill，重启你的 AI 工具即可。

### Claude Code

如果你希望完整安装本仓库提供的插件能力，可以在 Claude Code 中先把这个仓库添加为插件市场：

```bash
claude plugin marketplace add SummerSec/semantic-linter
```

然后安装插件本体：

```bash
claude plugin install semantic-linter@summersec-semantic-linter
```

如果安装完成后当前会话没有立刻加载插件，可以执行：

```bash
/reload-plugins
```

更新时建议先刷新 marketplace 缓存，再更新插件本体：

```bash
# 先刷新 marketplace 缓存，再更新插件
claude plugin marketplace update summersec-semantic-linter
claude plugin update semantic-linter@summersec-semantic-linter
```

### 开发者安装（源码）

如果你想直接基于源码使用，或者本地调试、跟进仓库最新改动，可以把仓库克隆到 Claude 的插件目录：

```bash
git clone https://github.com/SummerSec/semantic-linter.git ~/.claude/plugins/semantic-linter
```

然后手动登记到 `~/.claude/plugins/installed_plugins.json`：

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

Windows 下请把 `installPath` 改成 `C:/Users/<you>/.claude/plugins/semantic-linter`。

配置完成后，重启 Claude Code，或执行 `/reload-plugins`。如果你使用的是源码安装，后续更新方式如下：

```bash
cd ~/.claude/plugins/semantic-linter
git pull
```

## 扫描范围

Linter 对匹配以下模式的文件生效：

| 匹配规则 | 示例 |
|---|---|
| 文件名 | `skill.md`、`SKILL.md`、`claude.md`、`CLAUDE.md` |
| 后缀 | `*.prompt.md`、`*_definitions.md`、`*_examples.md` |
| 目录 | `/skills/`、`/agents/`、`/commands/`、`/rules/`、`/prompts/` |

其他文件将被静默跳过。

## 检测流水线

```
文件检测 ──→ 内容扫描 ──→ 结构分析 ──→ 报告生成
(路径匹配)   (词典匹配)   (模式检测)   (Markdown)
```

### 阶段 1 — 文件检测

根据已知的指令文件模式检查文件路径，仅处理 `.md` 文件。

### 阶段 2 — 内容扫描

- 去除代码块，防止示例代码产生误报
- 对照 27 组陷阱词对进行匹配（基于 Map 的 O(1) 查找）
- 对每个匹配项进行上下文角色分类：
  - **constraint_keyword（约束关键词）** — 最高风险（如"必须避免风险"）
  - **task_target（任务目标）** — 中等风险（如"分析风险"）
  - **auxiliary（辅助描述）** — 较低风险（如"可能存在风险"）
- 去重：每个词汇在单个文件中仅报告一次

### 阶段 3 — 结构分析

检测四种结构性风险模式：

| 风险类型 | 示例（触发告警） | 示例（通过） |
|---|---|---|
| 开放式动词 | "分析代码" | "分析代码中的以下方面" |
| 抽象化目标 | "评估安全性" | "检测漏洞" |
| 情态动词降级 | 约束中使用"应该" | 约束中使用"必须" |
| 缺少否定清单 | 高严重级别词汇，无排除说明 | 词汇 + "不包括..." |

### 阶段 4 — 报告生成

生成结构化 Markdown 报告，包含：
- 整体风险等级
- 陷阱词汇表（词汇、ID、严重等级、上下文角色、替换建议、行号）
- 结构性风险（类型、上下文、建议）
- 行动建议

## 严重等级

```
critical > high > medium-high > medium > low
```

严重等级根据上下文角色进行调整：
- 约束关键词：基础严重等级（不变）
- 任务目标：基础严重等级（不变）
- 辅助描述：降低 1 个等级

## 输出示例

```markdown
## 语义陷阱检测报告

**文件**: skills/code-review/skill.md
**发现**: 2 个陷阱词汇, 1 个结构性风险
**整体风险**: HIGH

### 陷阱词汇

| # | 词汇 | ID  | 严重等级 | 上下文角色      | 替换建议 | 行号 |
|---|------|-----|---------|---------------|---------|------|
| 1 | 风险 | T01 | critical | constraint_keyword | 漏洞 | 12 |
| 2 | 审查 | T02 | high    | task_target    | 检查   | 5  |

### 结构性风险

| 类型 | 范围 | 上下文 | 建议 |
|------|-----|--------|-----|
| 开放式动词 | 第 8 行 | "分析代码" | 添加范围限定词 |
```

## 运行测试

```bash
npm test
```

共 33 个测试用例，覆盖全部 4 个模块，使用 Node.js 内置 `assert` 模块（零测试框架依赖）。

## 项目结构

```
semantic-linter/
├── hooks/
│   ├── hooks.json              # Hook 注册配置
│   └── semantic-linter.js      # Hook 入口
├── lib/
│   ├── file-detector.js        # 阶段 1：路径模式匹配
│   ├── content-scanner.js      # 阶段 2：词典匹配 + 上下文分析
│   ├── lexicon-data.js         # 陷阱词数据库（27 组）
│   ├── structural-analyzer.js  # 阶段 3：结构性风险检测
│   └── report-formatter.js     # 阶段 4：Markdown 报告生成
├── tests/
│   └── test-scanner.js         # 33 个测试用例
├── references/
│   └── semantic-trap-lexicon.md # 完整词典文档
├── package.json
└── CLAUDE.md
```

## 设计决策

1. **O(1) 词典查找** — 基于 Map 实现，非线性搜索
2. **上下文感知严重等级** — 同一词汇在不同句子角色中风险不同
3. **代码块去除** — 文档中的示例代码不会产生误报
4. **去重机制** — 每个陷阱词在每个文件中仅报告一次（使用 `pairId:word` 作为键）
5. **优雅容错** — Hook 始终返回 `continue: true`，从不阻塞 Claude
6. **独立的语言路径** — 中文使用子串匹配，英文使用单词边界正则
