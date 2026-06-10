---
description: 在当前项目生成/更新语义规则文件 semantic-rules.md 与 CLAUDE.md 指针（词典更新后重跑）
---

# 生成/更新本项目语义规则

把插件词典的语义约束规则写入当前项目，产出两份：`semantic-rules.md`（规则全文）+ `CLAUDE.md` 受管区指针。

## 执行步骤

1. 用 `pwd` 取当前工作目录，目标为 `$(pwd)/CLAUDE.md`。
2. 定位插件脚本：
   ```bash
   for p in "${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js" "$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js"; do
     [ -f "$p" ] && echo "FOUND: $p" && break
   done
   ```
3. 运行生成（幂等，已有则就地更新）：
   ```bash
   node "<SCRIPT>" "$(pwd)/CLAUDE.md"
   ```
4. 校验：
   ```bash
   node "<SCRIPT>" --check "$(pwd)/CLAUDE.md"
   ```
5. 向用户报告两份产物路径与校验结果。

## 注意

- **禁止手写规则内容**，只能由脚本生成。
- `semantic-rules.md` 固定生成在 CLAUDE.md 同目录，勿移入 `/rules/`、`/skills/` 等目录（会被 linter 当指令文件扫描）。
- 详细工作流见 `rules-installer` skill。
