#!/usr/bin/env node
/**
 * 从 lib/lexicon-data.js 生成语义约束规则，产出两份文件：
 *   1) <dir>/semantic-rules.md —— 规则全文（四维标准 + 27 对速查表 + 锚定策略 + 自查指令）
 *   2) <dir>/CLAUDE.md 受管区 —— 仅「指针 + 场景」短文本，指引模型按需去读 semantic-rules.md
 *
 * 设计动机：Hook 是纯 Node 脚本，运行时无法调用大模型。把语义判定标准写成规则文件，
 * 并在 CLAUDE.md 常驻一段轻量指针——模型读到指针后，在写指令文件时按需加载完整规则，
 * 既保住「模型主动收窄陷阱词」的能力，又避免规则全文每会话常驻消耗上下文。
 *
 * 数据同源：直接 require 词典模块（由 build-lexicon 从 MD 生成），不重复解析。
 *
 * 用法:
 *   node scripts/build-rules.js [claudeMdPath]           写入规则文件 + CLAUDE.md 指针（默认 ./CLAUDE.md）
 *   node scripts/build-rules.js --check [claudeMdPath]   仅校验两份产物与当前词典一致（不写盘）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEXICON_PATH = path.join(ROOT, 'lib', 'lexicon-data.js');

const BEGIN = '<!-- STL:RULES:BEGIN -->';
const END = '<!-- STL:RULES:END -->';

// 规则文件名（与 CLAUDE.md 同目录）
const RULES_FILENAME = 'semantic-rules.md';

// 严重等级 → 中文标签（展示用）
const SEV_LABEL = {
  critical: '极高',
  high: '高',
  'medium-high': '中高',
  medium: '中',
  low: '低',
};

function loadPairs() {
  delete require.cache[require.resolve(LEXICON_PATH)];
  const lex = require(LEXICON_PATH);
  return { zhPairs: lex.zhPairs, enPairs: lex.enPairs, order: lex.SEVERITY_ORDER };
}

// 按 severity 降序、同级按 id 升序排序
function sortBySeverity(pairs, order) {
  return [...pairs].sort((a, b) => {
    const d = (order[b.severity] || 0) - (order[a.severity] || 0);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function zhTableRows(zhPairs, order) {
  return sortBySeverity(zhPairs, order)
    .map(
      (p) =>
        `| ${p.id} | ${p.wide} → **${p.narrow}** | ${SEV_LABEL[p.severity] || p.severity} | ${p.scenario} |`
    )
    .join('\n');
}

function enTableRows(enPairs, order) {
  return sortBySeverity(enPairs, order)
    .map(
      (p) =>
        `| ${p.id} | ${p.wide} → **${p.narrow}** | ${SEV_LABEL[p.severity] || p.severity} | ${p.scenario} |`
    )
    .join('\n');
}

/**
 * 渲染独立规则文件 semantic-rules.md 的完整内容。
 * 内容来源：四维标准取自 skills/semantic-analyzer/SKILL.md；
 * 锚定策略取自 references/semantic-trap-lexicon.md；速查表由词典数据生成。
 */
function generateRulesFile(zhPairs, enPairs, order) {
  const total = zhPairs.length + enPairs.length;
  return `# 语义陷阱约束规则（自动生成，请勿手动编辑）

> 本文件由 \`npm run build-rules\` 从语义陷阱词典生成，共 ${total} 对陷阱词。
> 词典更新后重新运行生成器即可同步；CLAUDE.md 中有一段指针指向本文件。

**适用场景**：编写或修改 skill / agent / command / prompt 等**指令类文件**时。

**核心原理**：某些词在大模型语义空间中的激活范围（语义边界）远宽于日常含义。
宽边界词会让输出突破 Prompt 约束、产生超范围联想。下笔前主动识别并收窄。

## 判定一个词是否为陷阱（四维特征）

满足越多、边界越宽、越需替换：

1. **程度性 vs 二元性**：陷阱词偏程度连续（可大可小）；安全词偏是否、通过/不通过。
2. **展望性**：含「潜在」「可能」等拉远时间轴的成分。
3. **主观评价性**：判定依赖评判者标准，因人/场景而异。
4. **关联松散度**：联想网大、难以收敛到单一对象。

## 已知陷阱词速查（宽边界 → 窄边界，按严重度降序）

下笔时若用到「宽边界」一侧的词，优先替换为对应「窄边界」词；确需保留宽词时套用下方锚定策略。

中文：

| ID | 宽 → 窄（推荐） | 严重度 | 失控场景 |
|----|----------------|--------|---------|
${zhTableRows(zhPairs, order)}

英文：

| ID | 宽 → 窄（推荐） | 严重度 | 失控场景 |
|----|----------------|--------|---------|
${enTableRows(enPairs, order)}

## 必须使用宽边界词时——边界锚定三策略

1. **前置否定清单**：在定义中明确排除不属于本任务范围的内容（"以下不属于评估范围：…"）。
2. **输出格式硬约束**：把输出设计成结构化填空/枚举，消除塞入额外内容的空间。
3. **反例强化**：示例中明确展示"看起来像但不属于"的反例及其判定。

## 自查指令

写指令类文件前，对照上表扫描关键动词/名词：
- 命中宽边界词 → 优先替换为窄边界词；
- 业务上必须用宽词 → 至少套用一条锚定策略；
- 表外但符合四维特征的可疑词 → 同样收窄，必要时反馈以纳入词典。
`;
}

/**
 * 渲染 CLAUDE.md 受管区内容（指针 + 场景）。
 * 注意：措辞刻意避开词典中的宽边界词与结构触发模式，使 CLAUDE.md 自身扫描不产生误报。
 */
function generatePointerBlock(total) {
  const body = `## 语义约束规则（按需加载）

> 本区块由 \`npm run build-rules\` 生成，请勿手动编辑。

同目录下的 \`${RULES_FILENAME}\` 收录了语义陷阱词对照表（宽边界 → 窄边界，共 ${total} 对）与四维收窄判定标准。

**何时打开它**：编写或修改 skill / agent / command / prompt 等指令类文件前，先读 \`${RULES_FILENAME}\`，据其把宽边界用词替换为更窄的用词；必须保留宽边界词时，套用其中的边界锚定策略。`;
  return `${BEGIN}\n${body}\n${END}`;
}

function extractManagedRegion(text) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + END.length);
}

function injectIntoFile(targetPath, block) {
  let existing = '';
  if (fs.existsSync(targetPath)) existing = fs.readFileSync(targetPath, 'utf8');

  const region = extractManagedRegion(existing);
  if (region !== null) {
    // 替换已有受管区
    return existing.replace(region, block);
  }
  // 追加到文件末尾（确保前面恰有一个空行分隔）
  if (existing === '') return `${block}\n`;
  const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${block}\n`;
}

function resolveTarget(argv) {
  const positional = argv.filter((a) => a !== '--check');
  return path.resolve(positional[0] || path.join(ROOT, 'CLAUDE.md'));
}

function rel(p) {
  return path.relative(ROOT, p) || p;
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const claudeMdPath = resolveTarget(argv);
  const rulesPath = path.join(path.dirname(claudeMdPath), RULES_FILENAME);

  const { zhPairs, enPairs, order } = loadPairs();
  const total = zhPairs.length + enPairs.length;
  const rulesContent = generateRulesFile(zhPairs, enPairs, order);
  const pointerBlock = generatePointerBlock(total);

  if (check) {
    // ① 校验规则文件
    if (!fs.existsSync(rulesPath)) {
      console.error(`Rules file missing: ${rel(rulesPath)} 不存在。Run: npm run build-rules`);
      process.exit(1);
    }
    if (fs.readFileSync(rulesPath, 'utf8') !== rulesContent) {
      console.error(`${rel(rulesPath)} is out of sync with the lexicon. Run: npm run build-rules`);
      process.exit(1);
    }
    // ② 校验 CLAUDE.md 指针受管区
    if (!fs.existsSync(claudeMdPath)) {
      console.error(`Managed region missing: ${rel(claudeMdPath)} 不存在。Run: npm run build-rules`);
      process.exit(1);
    }
    const region = extractManagedRegion(fs.readFileSync(claudeMdPath, 'utf8'));
    if (region === null) {
      console.error(`Managed region missing in ${rel(claudeMdPath)}. Run: npm run build-rules`);
      process.exit(1);
    }
    if (region !== pointerBlock) {
      console.error(`Managed region in ${rel(claudeMdPath)} is out of sync. Run: npm run build-rules`);
      process.exit(1);
    }
    console.log(`OK: ${rel(rulesPath)} 与 ${rel(claudeMdPath)} 受管区均与词典一致`);
    process.exit(0);
  }

  // 写规则文件
  fs.writeFileSync(rulesPath, rulesContent, 'utf8');
  // 写/更新 CLAUDE.md 指针受管区
  const nextClaudeMd = injectIntoFile(claudeMdPath, pointerBlock);
  fs.writeFileSync(claudeMdPath, nextClaudeMd, 'utf8');
  console.log(`Wrote ${rel(rulesPath)} and managed pointer into ${rel(claudeMdPath)}`);
}

main();
