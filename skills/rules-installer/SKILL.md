---
name: rules-installer
description: 把 Semantic-Linter 的语义约束规则注入到当前项目的 AGENTS.md 或 CLAUDE.md，使模型读项目指令时按需自查陷阱词。当用户要"安装语义规则到 AGENTS.md""安装语义规则到 CLAUDE.md""注入约束规则""让模型自查陷阱词""install semantic rules""把陷阱词标准写进项目"时使用。
---

# 语义约束规则安装器

为**用户当前项目**注入两份产物：
- `semantic-rules.md`（与项目指令文件同目录）——语义陷阱词对照表 + 四维收窄判定标准 + 边界锚定策略**全文**；
- 项目指令文件受管区（`AGENTS.md` for Codex，`CLAUDE.md` for Claude Code；marker 为 `<!-- STL:RULES:BEGIN -->` … `<!-- STL:RULES:END -->`）——一段**指针 + 场景**短文本，常驻上下文，指引模型在写指令文件时**按需打开** `semantic-rules.md`。

这样规则全文不必每会话常驻消耗上下文，模型读到指针后按需加载；写 skill / agent / command / prompt 等指令文件时据此收窄宽边界词。

## 核心规则（必读）

- **必须运行脚本生成，禁止手写。** 规则全文含 27 对陷阱词 + 四维标准 + 锚定策略，凭记忆手写必然出错或漂移。唯一正确做法是运行插件的 `scripts/build-rules.js`，它从插件词典确定性生成两份文件。
- **目标默认按已有文件选择**：若当前目录已有 `CLAUDE.md` / `AGENTS.md`，一次性注入所有已存在的目标文件；两者都不存在时，Codex 创建 `AGENTS.md`，Claude Code 创建 `CLAUDE.md`。用户明确给出目标时按用户指定路径。
- 脚本**幂等**：目标文件已有受管区则就地替换、规则文件直接覆盖，不会重复追加。

## 工作流

### STEP 1：确认目标文件

1. 用 `pwd` 取当前工作目录。
2. 查找目标：
   - 若 `<cwd>/CLAUDE.md` 存在，加入目标列表
   - 若 `<cwd>/AGENTS.md` 存在，加入目标列表
   - 若两者都不存在：Codex 用 `<cwd>/AGENTS.md`；Claude Code 用 `<cwd>/CLAUDE.md`
3. 向用户复述完整目标路径列表，确认后再写。若用户想写到别的项目，用用户给定路径替代。

### STEP 2：定位插件的 build-rules.js

按优先级查找脚本（命中即用）：

1. 环境变量：`${CODEX_PLUGIN_ROOT}/scripts/build-rules.js`
2. 环境变量：`${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js`
3. Codex 常见源码路径：`./scripts/build-rules.js`
4. Claude Code 常见安装路径：`~/.claude/plugins/semantic-linter/scripts/build-rules.js`
5. 以上都不存在 → 请用户给出 semantic-linter 插件目录，拼接 `scripts/build-rules.js`。

用一条命令定位（示例）：

```bash
for p in "${CODEX_PLUGIN_ROOT}/scripts/build-rules.js" "${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js" "./scripts/build-rules.js" "$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js"; do
  [ -f "$p" ] && echo "FOUND: $p" && break
done
```

### STEP 3：注入规则

若使用默认“已有文件全部注入”模式，用定位到的脚本路径 `<SCRIPT>` 在当前项目运行：

```bash
node "<SCRIPT>" --existing "$(pwd)"
```

若用户明确指定一个或多个目标文件，则直接传目标列表：

```bash
node "<SCRIPT>" "<TARGET_MD_1>" "<TARGET_MD_2>"
```

输出 `Wrote semantic-rules.md and managed pointer into ...` 即成功（同时生成规则文件与目标文件指针）。目标列表有多个文件时，每个文件会各输出一行。

### STEP 4：校验

```bash
node "<SCRIPT>" --check --existing "$(pwd)"
```

退出码 0 且打印 `OK: ... 均与词典一致` 表示两份产物都正确。

### STEP 5：告知用户

1. 说明已生成/更新：`<cwd>/semantic-rules.md`（规则全文）与目标文件受管区指针（可能是 `CLAUDE.md`、`AGENTS.md` 或两者）。
2. 说明效果：模型读到项目指令文件指针后，在编写指令文件时按需打开 `semantic-rules.md`，据其把宽边界词收窄为窄边界词；必须用宽词时套用锚定策略。
3. 提示后续：插件词典更新后，重跑本 skill 即可同步两份产物。

## Gotchas

- **不要手写或编辑 `semantic-rules.md` 与目标文件受管区**；改动只能通过重跑脚本。手改会让 `--check` 失败。
- 目标文件受管区外的正文不受影响，脚本只替换 marker 之间的部分。
- 规则文件固定名为 `semantic-rules.md` 且生成在目标文件同目录——**勿移动到 `/rules/`、`/skills/` 等目录**，否则会被本插件的 linter 当指令文件扫描而误报。
- 非 git 项目同样可用——脚本只读写普通文件，不依赖版本控制。
- 若用户已在仓库源码内开发本插件，应改用 `npm run build-rules`（写插件自己的两份产物），无需本 skill。
