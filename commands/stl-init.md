---
description: semantic-linter 首次使用向导——检查安装、把语义规则铺到当前项目、说明后续如何自动生效
---

# semantic-linter 首次使用向导

带用户完成首次配置，分三步执行，每步向用户报告结果。

## 步骤 1：确认插件已就位

- 用 `pwd` 取当前工作目录作为目标项目。
- 定位插件脚本（命中即用）：
  1. `${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js`
  2. `$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js`
  3. 都不存在 → 请用户给出插件目录。

```bash
for p in "${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js" "$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js"; do
  [ -f "$p" ] && echo "FOUND: $p" && break
done
```

## 步骤 2：把语义规则铺到当前项目

调用 `rules-installer` skill（或直接运行定位到的脚本），在当前项目生成两份产物：

```bash
node "<SCRIPT>" "$(pwd)/CLAUDE.md"
```

生成 `semantic-rules.md`（规则全文）与 `CLAUDE.md` 受管区指针。向用户复述这两个路径。

## 步骤 3：说明后续如何生效

向用户讲清三点：

1. **写指令文件时自动提示**：Pre/PostToolUse hook 会在 Write/Edit `/skills/`、`SKILL.md`、`CLAUDE.md` 等文件时，提示宽边界词与窄边界替换词。
2. **模型按需自查**：CLAUDE.md 里的指针会让模型在写指令文件前打开 `semantic-rules.md`，据其收窄用词。
3. **常用快捷命令**：
   - `/stl-rules` — 词典更新后，重新生成本项目的规则文件
   - `/stl-lexicon` — 增删改陷阱词对
   - `/stl-scan`（如需）或 `npm run scan -- <文件>` — 手动扫描某个文件

最后告诉用户：日常无需手动操作，写指令文件时提示会自动出现。
