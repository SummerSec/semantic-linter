---
name: rules-installer
description: 把 semantic-linter 的语义约束规则注入到当前项目的 CLAUDE.md，使模型每会话自动加载、写指令文件时据此自查陷阱词。当用户要"安装语义规则到 CLAUDE.md""注入约束规则""让模型自查陷阱词""install semantic rules""把陷阱词标准写进项目"时使用。
---

# 语义约束规则安装器

把插件内置的语义约束规则块，写入**用户当前项目**的 `CLAUDE.md` 受管区（`<!-- STL:RULES:BEGIN -->` … `<!-- STL:RULES:END -->`）。规则进入 CLAUDE.md 后，每个会话自动加载，模型在写 skill / agent / command / rules / prompt 等指令文件时据此自查并收窄宽边界词。

## 核心规则（必读）

- **必须运行脚本生成规则块，禁止手写。** 规则块含 27 对陷阱词 + 四维标准 + 锚定策略，凭记忆手写必然出错或漂移。唯一正确做法是运行插件的 `scripts/build-rules.js`，它从插件词典确定性生成。
- **目标默认是用户当前工作目录的 `CLAUDE.md`**，不是插件自己的。
- 脚本**幂等**：目标已有受管区则就地替换，不会重复追加；目标无 CLAUDE.md 则新建。

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

### STEP 3：注入规则块

用定位到的脚本路径 `<SCRIPT>` 与目标 `<cwd>/CLAUDE.md` 运行：

```bash
node "<SCRIPT>" "<cwd>/CLAUDE.md"
```

输出 `Wrote managed region into ...` 即成功。

### STEP 4：校验

```bash
node "<SCRIPT>" --check "<cwd>/CLAUDE.md"
```

退出码 0 且打印 `OK: ... 受管区与词典一致` 表示写入正确。

### STEP 5：告知用户

1. 展示目标 CLAUDE.md 中新增的受管区位置（文件末尾或原受管区）。
2. 说明效果：下个会话起，该项目内编写指令文件时，模型会对照规则把宽边界词收窄为窄边界词；必须用宽词时套用锚定策略。
3. 提示后续：插件词典更新后，重跑本 skill 即可同步规则。

## Gotchas

- **不要手写或编辑受管区内容**；改动只能通过重跑脚本。手动改受管区会让 `--check` 失败。
- 受管区外的 CLAUDE.md 正文不受影响，脚本只替换 marker 之间的部分。
- 非 git 项目同样可用——脚本只读写普通文件，不依赖版本控制。
- 若用户已在仓库源码内开发本插件，应改用 `npm run build-rules`（写插件自己的 CLAUDE.md），无需本 skill。
