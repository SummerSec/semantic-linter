---
name: rules-installer
description: 把 semantic-linter 的语义约束规则注入到当前项目的 CLAUDE.md，使模型每会话自动加载、写指令文件时据此自查陷阱词。当用户要"安装语义规则到 CLAUDE.md""注入约束规则""让模型自查陷阱词""install semantic rules""把陷阱词标准写进项目"时使用。
---

# 语义约束规则安装器

为**用户当前项目**注入两份产物：
- `semantic-rules.md`（与 CLAUDE.md 同目录）——语义陷阱词对照表 + 四维收窄判定标准 + 边界锚定策略**全文**；
- `CLAUDE.md` 受管区（`<!-- STL:RULES:BEGIN -->` … `<!-- STL:RULES:END -->`）——一段**指针 + 场景**短文本，常驻上下文，指引模型在写指令文件时**按需打开** `semantic-rules.md`。

这样规则全文不必每会话常驻消耗上下文，模型读到指针后按需加载；写 skill / agent / command / prompt 等指令文件时据此收窄宽边界词。

## 核心规则（必读）

- **必须运行脚本生成，禁止手写。** 规则全文含 27 对陷阱词 + 四维标准 + 锚定策略，凭记忆手写必然出错或漂移。唯一正确做法是运行插件的 `scripts/build-rules.js`，它从插件词典确定性生成两份文件。
- **目标默认是用户当前工作目录的 `CLAUDE.md`**，不是插件自己的；`semantic-rules.md` 自动生成在其同目录。
- 脚本**幂等**：CLAUDE.md 已有受管区则就地替换、规则文件直接覆盖，不会重复追加。

## 工作流

### STEP 1：确认目标文件

1. 用 `pwd` 取当前工作目录，目标即 `<cwd>/CLAUDE.md`。
2. 向用户复述完整目标路径，确认后再写。若用户想写到别的项目，用用户给定路径替代。

### STEP 2：定位插件的 build-rules.js

按优先级查找脚本（命中即用）：

1. 环境变量：`${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js`
2. 常见安装路径：`~/.claude/plugins/semantic-linter/scripts/build-rules.js`
3. 以上都不存在 → 请用户给出 semantic-linter 插件目录，拼接 `scripts/build-rules.js`。

用一条命令定位（示例）：

```bash
for p in "${CLAUDE_PLUGIN_ROOT}/scripts/build-rules.js" "$HOME/.claude/plugins/semantic-linter/scripts/build-rules.js"; do
  [ -f "$p" ] && echo "FOUND: $p" && break
done
```

### STEP 3：注入规则

用定位到的脚本路径 `<SCRIPT>` 与目标 `<cwd>/CLAUDE.md` 运行：

```bash
node "<SCRIPT>" "<cwd>/CLAUDE.md"
```

输出 `Wrote semantic-rules.md and managed pointer into ...` 即成功（同时生成规则文件与 CLAUDE.md 指针）。

### STEP 4：校验

```bash
node "<SCRIPT>" --check "<cwd>/CLAUDE.md"
```

退出码 0 且打印 `OK: ... 均与词典一致` 表示两份产物都正确。

### STEP 5：告知用户

1. 说明已生成两份：`<cwd>/semantic-rules.md`（规则全文）与 `CLAUDE.md` 受管区指针。
2. 说明效果：下个会话起，模型读到 CLAUDE.md 指针后，在编写指令文件时按需打开 `semantic-rules.md`，据其把宽边界词收窄为窄边界词；必须用宽词时套用锚定策略。
3. 提示后续：插件词典更新后，重跑本 skill 即可同步两份产物。

## Gotchas

- **不要手写或编辑 `semantic-rules.md` 与 CLAUDE.md 受管区**；改动只能通过重跑脚本。手改会让 `--check` 失败。
- CLAUDE.md 受管区外的正文不受影响，脚本只替换 marker 之间的部分。
- 规则文件固定名为 `semantic-rules.md` 且生成在 CLAUDE.md 同目录——**勿移动到 `/rules/`、`/skills/` 等目录**，否则会被本插件的 linter 当指令文件扫描而误报。
- 非 git 项目同样可用——脚本只读写普通文件，不依赖版本控制。
- 若用户已在仓库源码内开发本插件，应改用 `npm run build-rules`（写插件自己的两份产物），无需本 skill。
