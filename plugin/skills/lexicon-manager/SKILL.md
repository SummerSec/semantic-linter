---
name: lexicon-manager
description: 语义陷阱词典维护工具——交互式添加、修改或删除语义陷阱词汇对。当用户需要管理 semantic-linter 词典时使用。触发关键词包括："添加陷阱词"、"新增词典条目"、"修改词典"、"删除陷阱词"、"维护词典"、"管理词汇对"、"add trap word"、"update lexicon"、"manage lexicon"、"delete trap word"、"词典管理"。也适用于用户要求查看当前词典内容、调整词汇严重等级、或批量导入词汇对时。
---

# 语义陷阱词典管理器

交互式维护 semantic-linter 的语义陷阱词汇对词典，支持添加、修改、删除操作，并自动同步数据文件和参考文档。

## 数据文件位置

词典维护涉及两个文件，必须保持同步：

1. **数据文件**：`plugin/lib/lexicon-data.js` — 运行时 O(1) 查找的词典数据
2. **参考文档**：`plugin/references/semantic-trap-lexicon.md` — 人类可读的词典说明文档

## 词汇对数据结构

### 中文词汇对 (zhPairs)

```javascript
{
  id: 'T{nn}',           // 唯一标识，格式 T01-T99
  narrow: '漏洞',        // 窄边界词（推荐使用）
  wide: '风险',          // 宽边界词（应避免使用）
  narrowEn: 'Vulnerability', // 窄边界词英文
  wideEn: 'Risk',        // 宽边界词英文
  severity: 'critical',  // 严重等级
  scenario: '...'         // 失控场景说明
}
```

### 英文词汇对 (enPairs)

```javascript
{
  id: 'E{nn}',           // 唯一标识，格式 E01-E99
  narrow: 'Vulnerability',// 窄边界词
  wide: 'Risk',          // 宽边界词
  narrowAlt: '...',      // 窄边界词备选（可选）
  wideAlt: '...',        // 宽边界词备选（可选）
  severity: 'critical',  // 严重等级
  scenario: '...'         // 失控场景说明
}
```

### 严重等级（severity）

从高到低：`critical` > `high` > `medium-high` > `medium` > `low`

选择依据：
- **critical**：词汇替换后输出内容量变化超过 50%，或完全偏离任务目标
- **high**：触发明显的主观判断或超范围联想
- **medium-high**：触发适度发散，但仍在相关范围内
- **medium**：边界略有模糊，但对输出质量影响有限
- **low**：理论上存在语义差异，但实际影响极小

## 维护工作流

### STEP 1：读取当前词典

读取 `plugin/lib/lexicon-data.js`，向用户展示当前词典概览：

```
📖 当前词典概览
中文词汇对 (zhPairs): T01-T{last} 共 N 个
英文词汇对 (enPairs): E01-E{last} 共 M 个

中文词汇对列表：
| ID  | 窄边界词 | 宽边界词 | 严重等级 |
|-----|---------|---------|---------|
| T01 | 漏洞    | 风险    | critical |
| ... | ...     | ...     | ...      |

英文词汇对列表：
| ID  | 窄边界词 | 宽边界词 | 严重等级 |
|-----|---------|---------|---------|
| E01 | Vulnerability | Risk | critical |
| ... | ...     | ...     | ...      |
```

### STEP 2：确认操作

向用户确认要执行的操作类型：

#### 操作 A：添加词汇对

向用户收集以下信息（逐项确认）：

1. **语言**：中文 (T系列) 或 英文 (E系列)
2. **宽边界词 (wide)**：要检测的危险词汇
3. **窄边界词 (narrow)**：推荐的替换词汇
4. **严重等级 (severity)**：critical / high / medium-high / medium / low
5. **失控场景 (scenario)**：一句话说明为什么宽边界词危险
6. **英文对照**（仅中文词对需要）：narrowEn 和 wideEn
7. **备选词汇**（仅英文词对可选）：narrowAlt 和 wideAlt

**自动分配 ID**：取当前同系列最大 ID + 1（如当前最大 T17，新 ID 为 T18）

**验证规则**：
- wide 和 narrow 不能为空
- wide 不能与已有词汇对的 wide 重复
- severity 必须是五个等级之一
- scenario 不能为空

#### 操作 B：修改词汇对

1. 用户指定要修改的词汇对 ID（如 T05）
2. 展示该词对的当前完整信息
3. 用户指定要修改的字段和新值
4. 确认修改内容

#### 操作 C：删除词汇对

1. 用户指定要删除的词汇对 ID
2. 展示该词对的完整信息
3. 要求用户明确确认删除（因为会影响检测能力）
4. **注意**：删除后不重新编号，保持 ID 稳定性

### STEP 3：执行修改

按以下顺序修改文件：

**3a. 修改 `plugin/lib/lexicon-data.js`**

- 添加：在 zhPairs 或 enPairs 数组末尾添加新条目
- 修改：更新目标条目的指定字段
- 删除：从数组中移除目标条目

保持代码格式一致：每个条目一行，字段顺序为 id → narrow → wide → narrowEn/wideEn → severity → scenario。

**3b. 同步更新 `plugin/references/semantic-trap-lexicon.md`**

- 添加：在对应表格（高危词汇对 或 扩展词汇对 或 英文词汇对）中添加新行
- 修改：更新对应表格行
- 删除：从对应表格中移除该行

表格格式：
```markdown
| T{nn} | 窄边界词 (English) | 宽边界词 (English) | 语义宽度差 | 失控场景 |
```

**3c. 如果修改了严重等级，检查 LLM 语义敏感度矩阵**

矩阵位于 `semantic-trap-lexicon.md` 的"LLM 语义敏感度矩阵"章节。如果添加新词汇或修改了等级，评估是否需要更新矩阵中词汇的位置。

### STEP 4：验证

执行以下验证步骤：

```bash
# 1. 运行测试确保不破坏现有功能
npm test

# 2. 用 CLI 扫描词典文档自身（检查文档是否引入陷阱词）
npm run scan -- plugin/references/semantic-trap-lexicon.md
```

向用户展示验证结果和更新后的词典概览。

## 批量操作

如果用户需要一次添加多个词汇对：

1. 收集所有待添加的词汇对列表
2. 逐一验证每个词汇对的字段
3. 批量写入 lexicon-data.js（一次编辑）
4. 批量更新 semantic-trap-lexicon.md（一次编辑）
5. 最后统一运行验证

## 注意事项

- 修改词典后必须运行 `npm test` 验证
- 新增的宽边界词会被 PreToolUse 和 PostToolUse hook 自动检测
- 删除词汇对会降低检测覆盖面，需谨慎操作
- 保持 zhPairs 和 enPairs 数组的条目顺序按 ID 排列
