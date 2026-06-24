---
description: semantic-linter 首次使用向导——检查安装、把语义规则铺到当前项目、说明后续如何生效
---

# semantic-linter 首次使用向导

带用户完成首次配置，分三步执行，每步向用户报告结果。

## 步骤 1：确认插件已就位

- 用 `pwd` 取当前工作目录作为目标项目。
- 目标文件按平台选择：Codex 用 `$(pwd)/AGENTS.md`，Claude Code 用 `$(pwd)/CLAUDE.md`。
- 定位插件脚本（命中即用）：
  1. `${CODEX_PLUGIN_ROOT}/scripts/build-rules.js`
  2. `${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js`
  3. `./scripts/build-rules.js`
  4. `$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js`
  5. 都不存在 → 请用户给出插件目录。

```bash
for p in "${CODEX_PLUGIN_ROOT}/scripts/build-rules.js" "${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js" "./scripts/build-rules.js" "$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js"; do
  [ -f "$p" ] && echo "FOUND: $p" && break
done
```

## 步骤 2：把语义规则铺到当前项目

调用 `rules-installer` skill（或直接运行定位到的脚本），在当前项目生成两份产物：

```bash
node "<SCRIPT>" "<TARGET_MD>"
```

生成 `semantic-rules.md`（规则全文）与目标文件受管区指针。向用户复述这两个路径。

## 步骤 3：说明后续如何生效

向用户讲清三点：

1. **平台入口**：Codex 读 `AGENTS.md` 指针；Claude Code 还会通过 SessionStart hook 注入插件自带规则指针。
2. **模型按需自查**：模型读到指针后，在写 skill / agent / command / prompt 等指令文件前打开 `semantic-rules.md`，据其把宽边界用词替换为更窄的用词。
3. **常用快捷命令**：
   - `/stl-rules` — 词典更新后，重新生成本项目的规则文件
   - `/stl-lexicon` — 增删改陷阱词对
   - `npm run scan -- <文件>` — 手动扫描某个文件

最后告诉用户：日常无需手动操作；Codex 项目用 `AGENTS.md` 指针，Claude Code 项目用 `CLAUDE.md` 指针。
