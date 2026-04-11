/**
 * 将语义陷阱检测结果格式化为结构化报告
 * 支持三种输出模式：PreToolUse 预警、PostToolUse 确认、CLI 终端
 *
 * @module report-formatter
 */

const path = require('path');
const lexicon = require('./lexicon-data');

const ROLE_LABELS = {
  constraint_keyword: '约束关键词（高）',
  task_target: '任务目标（中）',
  auxiliary: '辅助描述（低）',
};

const TYPE_LABELS = {
  open_ended_verb: '开放式动词',
  adjective_target: '抽象化目标',
  modal_downgrade: '情态动词降级',
  missing_negation: '缺少否定清单',
};

// ANSI 颜色码（CLI 终端输出）
const ANSI = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  reset: '\x1b[0m',
};

/**
 * 根据所有检测结果计算整体风险等级
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @returns {string}
 */
function computeOverallRisk(lexiconMatches, structuralRisks) {
  let maxLevel = 0;
  for (const m of lexiconMatches) {
    maxLevel = Math.max(maxLevel, lexicon.SEVERITY_ORDER[m.severity] || 0);
  }
  for (const r of structuralRisks) {
    maxLevel = Math.max(maxLevel, lexicon.SEVERITY_ORDER[r.severity] || 0);
  }
  const entry = Object.entries(lexicon.SEVERITY_ORDER).find(([, v]) => v === maxLevel);
  return entry ? entry[0].toUpperCase() : 'LOW';
}

/**
 * 生成可直接应用的替换建议列表
 * @param {Array<Object>} lexiconMatches
 * @returns {string}
 */
function buildReplacements(lexiconMatches) {
  if (lexiconMatches.length === 0) return '';
  const lines = lexiconMatches.map((m, i) => {
    const pair = lexicon.wideWordsZh.get(m.word) || lexicon.wideWordsEn.get(m.word.toLowerCase());
    const reason = pair ? pair.scenario : '';
    return `${i + 1}. 第${m.line}行: "${m.word}" → "${m.replacement}" — ${reason}`;
  });
  return lines.join('\n');
}

/**
 * 生成核心报告表格（Markdown 格式，供 Pre/Post hook 共用）
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @param {string} fileName
 * @returns {string}
 */
function buildReportBody(lexiconMatches, structuralRisks, fileName) {
  const parts = [];

  parts.push(`**文件**: \`${fileName}\``);
  parts.push(`**发现**: ${lexiconMatches.length} 个陷阱词, ${structuralRisks.length} 个结构性风险`);
  parts.push(`**整体风险等级**: ${computeOverallRisk(lexiconMatches, structuralRisks)}`);

  if (lexiconMatches.length > 0) {
    parts.push('');
    parts.push('#### 陷阱词 | Trap Words');
    parts.push('');
    parts.push('| # | 陷阱词 | 编号 | 严重等级 | 上下文角色 | 替换建议 | 行号 |');
    parts.push('|---|--------|------|----------|------------|----------|------|');
    lexiconMatches.forEach((m, i) => {
      const role = ROLE_LABELS[m.contextRole] || m.contextRole;
      parts.push(`| ${i + 1} | ${m.word} | ${m.trapId} | ${m.severity} | ${role} | ${m.replacement} | L${m.line} |`);
    });
  }

  if (structuralRisks.length > 0) {
    parts.push('');
    parts.push('#### 结构性风险 | Structural Risks');
    parts.push('');
    structuralRisks.forEach((r, i) => {
      const typeLabel = TYPE_LABELS[r.type] || r.type;
      const lineInfo = r.line > 0 ? `[L${r.line}]` : '[全局]';
      parts.push(`${i + 1}. ${lineInfo} **${typeLabel}**: ${r.context}`);
      parts.push(`   → ${r.suggestion}`);
    });
  }

  return parts.join('\n');
}

/**
 * PreToolUse 预警报告 — 写入前主动拦截，指示 Claude 暂停并通知用户
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @param {string} filePath
 * @returns {string}
 */
function formatPre(lexiconMatches, structuralRisks, filePath) {
  const totalFindings = lexiconMatches.length + structuralRisks.length;
  if (totalFindings === 0) return '';

  const fileName = path.basename(filePath);
  const reportBody = buildReportBody(lexiconMatches, structuralRisks, fileName);
  const replacements = buildReplacements(lexiconMatches);

  const parts = [
    `### 🚨 语义陷阱检测器 - 写入前预警`,
    '',
    `在即将写入的 \`${fileName}\` 中发现 **${totalFindings}** 个语义陷阱问题。`,
    '',
    `**⚡ 执行指令（你必须执行以下操作）：**`,
    `1. 暂停当前写入任务`,
    `2. 向用户展示以下检测结果`,
    `3. 提供下方的具体替换方案`,
    `4. 等待用户确认后再继续`,
    '',
    reportBody,
  ];

  if (replacements) {
    parts.push('');
    parts.push('#### 可直接应用的替换方案');
    parts.push('');
    parts.push(replacements);
  }

  parts.push('');
  parts.push('---');
  parts.push('请向用户说明：这些宽边界词可能导致大模型语义发散和幻觉。建议在写入前应用上述替换。');
  parts.push('如用户同意，请在写入时直接应用替换；如用户拒绝，继续原始写入。');

  return parts.join('\n');
}

/**
 * PostToolUse 确认报告 — 写入后确认，提示 Claude 告知用户并建议修复
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @param {string} filePath
 * @returns {string}
 */
function format(lexiconMatches, structuralRisks, filePath) {
  const totalFindings = lexiconMatches.length + structuralRisks.length;
  if (totalFindings === 0) return '';

  const fileName = path.basename(filePath);
  const reportBody = buildReportBody(lexiconMatches, structuralRisks, fileName);
  const replacements = buildReplacements(lexiconMatches);

  const parts = [
    `### ✅ 语义陷阱检测器 - 写入后确认`,
    '',
    `\`${fileName}\` 已写入完成，检测到 **${totalFindings}** 个语义陷阱问题仍存在。`,
    '',
    `**📋 请向用户确认以下内容：**`,
    '',
    reportBody,
  ];

  if (replacements) {
    parts.push('');
    parts.push('#### 建议修复操作');
    parts.push('');
    parts.push(replacements);
  }

  parts.push('');
  parts.push('---');
  parts.push('请告知用户这些问题，并询问是否需要应用上述修复。如需修复，可直接编辑文件应用替换。');

  return parts.join('\n');
}

/**
 * 根据严重等级返回对应 ANSI 颜色
 * @param {string} severity
 * @returns {string}
 */
function severityColor(severity) {
  const level = lexicon.SEVERITY_ORDER[severity] || 0;
  return level >= 3 ? ANSI.red : ANSI.yellow;
}

/**
 * CLI 终端彩色报告
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @param {string} filePath
 * @returns {string}
 */
function formatCli(lexiconMatches, structuralRisks, filePath) {
  const totalFindings = lexiconMatches.length + structuralRisks.length;
  if (totalFindings === 0) {
    return `  ${ANSI.green}✔ 未发现语义陷阱${ANSI.reset}`;
  }

  const parts = [];

  for (const m of lexiconMatches) {
    const color = severityColor(m.severity);
    const role = ROLE_LABELS[m.contextRole] || m.contextRole;
    parts.push(`  ${color}✖ [${m.severity}] L${m.line}  "${m.word}" → "${m.replacement}"  (${m.trapId})${ANSI.reset}`);
    parts.push(`    ${ANSI.dim}${role}: ${m.context}${ANSI.reset}`);

    const pair = lexicon.wideWordsZh.get(m.word) || lexicon.wideWordsEn.get(m.word.toLowerCase());
    if (pair) {
      parts.push(`    ${ANSI.dim}→ ${pair.scenario}${ANSI.reset}`);
    }
    parts.push('');
  }

  for (const r of structuralRisks) {
    const color = severityColor(r.severity);
    const typeLabel = TYPE_LABELS[r.type] || r.type;
    const lineInfo = r.line > 0 ? `L${r.line}` : '全局';
    parts.push(`  ${color}⚠ [${r.severity}] ${lineInfo}  ${typeLabel}: ${r.context}${ANSI.reset}`);
    parts.push(`    ${ANSI.dim}→ ${r.suggestion}${ANSI.reset}`);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Concise single-paragraph warning for UserPromptSubmit hook
 * @param {Array<Object>} lexiconMatches
 * @returns {string}
 */
function formatPromptWarning(lexiconMatches) {
  if (lexiconMatches.length === 0) return '';

  const items = lexiconMatches.map(m => `"${m.word}" (-> ${m.replacement})`);
  const list = items.join(', ');

  return [
    `Semantic-linter: Your instruction contains ${lexiconMatches.length} wide-boundary word(s): ${list}.`,
    'These words may cause LLM output to exceed intended scope when used in instruction files.',
    'Consider using the narrower alternatives shown above.',
  ].join(' ');
}

/**
 * Build escalation prefix/suffix based on escalation level.
 * @param {number} level - 0-3
 * @param {Object} sessionTraps - { trapId: { count, files } }
 * @returns {{ prefix: string, suffix: string }}
 */
function buildEscalation(level, sessionTraps) {
  if (!level || level <= 0) return { prefix: '', suffix: '' };

  const repeated = [];
  if (sessionTraps) {
    for (const [trapId, data] of Object.entries(sessionTraps)) {
      if (data.count >= 2) {
        repeated.push(`${trapId}(${data.count}x)`);
      }
    }
  }

  if (level >= 3) {
    const fileCount = sessionTraps
      ? new Set(Object.values(sessionTraps).flatMap(d => d.files || [])).size
      : 0;
    return {
      prefix: 'PERSISTENT ',
      suffix: [
        '',
        `> **PERSISTENT**: Trap words detected across ${fileCount} files [${repeated.join(', ')}].`,
        '> Consider adding vocabulary rules to your project-level CLAUDE.md to prevent recurring issues.',
      ].join('\n'),
    };
  }

  if (level >= 2) {
    return {
      prefix: 'REPEATED ',
      suffix: [
        '',
        `> **REPEATED**: The following trap words have appeared 3+ times this session: ${repeated.join(', ')}.`,
        '> Review recent writing habits for these recurring patterns.',
      ].join('\n'),
    };
  }

  // L1
  return {
    prefix: '',
    suffix: [
      '',
      `> **Note**: Some trap words have been detected multiple times this session: ${repeated.join(', ')}.`,
    ].join('\n'),
  };
}

module.exports = {
  format,
  formatPre,
  formatCli,
  formatPromptWarning,
  buildReplacements,
  computeOverallRisk,
  buildEscalation,
};
