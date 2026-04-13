---
name: semantic-linter-shot
description: Lightweight semantic trap word detector — single-file reference card for identifying wide-boundary vocabulary in LLM instruction files. Use when writing or reviewing Skill/Prompt/Agent instructions. Trigger keywords include "quick scan", "trap check", "check wording", "词汇检查", "快速检测", "陷阱检查".
---

# Semantic Trap Word Detector (Shot Mode)

A concentrated, single-file reference for detecting semantic trap words in LLM instruction files. No plugin installation required — just read and apply.

## What Are Semantic Traps?

Semantic trap words are vocabulary with **wide semantic boundaries** that cause LLMs to produce outputs far beyond intended scope. For example, using "risk" instead of "vulnerability" in a security-focused Skill activates finance, health, legal, and career associations — causing ~27% accuracy drop.

**Core principle**: Replace wide-boundary words with narrow-boundary alternatives to constrain LLM output.

## Trap Word Reference Table

### Chinese (T01-T17)

| ID | Trap Word (Wide) | Replacement (Narrow) | Severity | Why It's Dangerous |
|----|-------------------|----------------------|----------|-------------------|
| T01 | 风险 | 漏洞 | critical | Activates finance/health/legal associations |
| T02 | 审查 | 检查 | high | Triggers subjective evaluation |
| T03 | 描述 | 列出 | high | Triggers explanatory prose |
| T04 | 问题 | 缺陷 | high | Extremely wide scope |
| T05 | 分析 | 总结 | medium-high | Triggers inference and hypothesis |
| T06 | 建议 | 要求 | medium-high | Triggers divergent thinking |
| T07 | 异常 | 错误 | medium | Fuzzy boundary |
| T08 | 改善 | 修复 | high | Triggers optimization suggestions |
| T09 | 参考 | 遵循 | medium-high | Implies flexibility |
| T10 | 评估 | 统计 | high | Triggers subjective judgment |
| T11 | 理解 | 提取 | high | Triggers inference |
| T12 | 关联 | 匹配 | medium | Triggers indirect reasoning |
| T13 | 转化 | 复制 | medium-high | Implies modification allowed |
| T14 | 洞察 | 报告 | high | Triggers creative inference |
| T15 | 评价 | 验证 | medium-high | Triggers subjective scoring |
| T16 | 原则 | 规则 | medium | Implies flexibility |
| T17 | 方法 | 步骤 | medium | Implies choice of paths |

### English (E01-E10)

| ID | Trap Word (Wide) | Replacement (Narrow) | Severity | Why It's Dangerous |
|----|-------------------|----------------------|----------|-------------------|
| E01 | Risk | Vulnerability | critical | Same as T01 |
| E02 | Review / Audit | Check | high | Triggers comprehensive evaluation |
| E03 | Describe / Explain | List | high | Triggers narrative expansion |
| E04 | Issue / Problem | Bug / Defect | high | Overly broad coverage |
| E05 | Analyze / Assess | Summarize | medium-high | Triggers deep reasoning |
| E06 | Suggestion / Recommendation | Requirement | medium-high | Triggers divergent thinking |
| E07 | Anomaly / Concern | Error | medium | Nearly boundless scope |
| E08 | Interpret | Extract | high | Triggers subjective interpretation |
| E09 | Evaluate / Judge | Verify | medium-high | Triggers multi-dimensional evaluation |
| E10 | Should / Could | Must / Shall | medium-high | Implies optional, not mandatory |

## Structural Risk Patterns

Beyond individual words, watch for these 4 patterns:

1. **Open-Ended Verbs**: "Analyze the code" without scope → Add specifics: "Analyze the code for the following 3 defect types: ..."
2. **Abstract Targets**: "Evaluate code safety" → Replace with concrete criteria: "Check if input validation exists for all API endpoints"
3. **Modal Downgrades**: "Should follow" in constraints → Use "Must follow" for mandatory rules
4. **Missing Negation Lists**: Using high-severity trap words without exclusions → Add "The following are NOT in scope: ..."

## How to Apply

When writing or editing instruction files (.md files in /skills/, /agents/, /rules/, /prompts/):

1. Scan each key noun and verb against the table above
2. If a wide-boundary word is found, suggest the narrow-boundary replacement
3. Check for the 4 structural risk patterns
4. When replacing, preserve the original intent — the goal is precision, not restriction

## Full Plugin

For automated detection with Pre/Post hooks, CLI scanning, escalation tracking, and deep semantic analysis, install the full `semantic-linter` plugin.
