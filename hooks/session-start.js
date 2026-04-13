#!/usr/bin/env node
/**
 * SessionStart Hook: Inject semantic trap awareness at session start
 *
 * Event: SessionStart (matcher: startup|resume|compact)
 * Injects brief additionalContext in旁白式 STL：… style.
 */

const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');

// Default top trap words (used when state-manager is unavailable)
const DEFAULT_TOP_TRAPS = [
  { zh: '风险', en: 'Risk', narrow: '漏洞/Vulnerability' },
  { zh: '审查', en: 'Review', narrow: '检查/Check' },
  { zh: '问题', en: 'Issue', narrow: '缺陷/Defect' },
  { zh: '分析', en: 'Analyze', narrow: '总结/Summarize' },
  { zh: '改善', en: 'Improve', narrow: '修复/Fix' },
];

/**
 * Build the additionalContext string.
 * @param {Object|null} sessionStats - from state-manager, or null
 * @param {Array|null} topTraps - from state-manager, or null
 * @returns {string}
 */
function buildContext(sessionStats, topTraps) {
  const traps = (topTraps && topTraps.length > 0)
    ? topTraps.slice(0, 5).map(t => t.trapId).join('、')
    : DEFAULT_TOP_TRAPS.map(t => `${t.zh}/${t.en}→${t.narrow}`).join('；');

  let sessionPart = '';
  if (sessionStats && sessionStats.detectionCount > 0) {
    sessionPart = ` STL：本会话已累计 ${sessionStats.detectionCount} 次命中，当前升级等级 L${sessionStats.escalationLevel || 0}。`;
  }

  return `STL：semantic-linter 已启用；PreToolUse 与 PostToolUse 会在指令类文件的 Write/Edit 前后扫描宽边界词。常见示例：${traps}。这些词易使输出范围失焦。${sessionPart}`.trim();
}

// Export for testing
module.exports = { buildContext };

// Only execute when run directly (not when required by tests)
if (require.main === module) {
  try {
    let sessionStats = null;
    let topTraps = null;
    try {
      const stateManager = require(path.join(libDir, 'state-manager'));
      stateManager.initState();
      sessionStats = stateManager.getSessionStats();
      topTraps = stateManager.getTopTraps(5);
    } catch {
      // state-manager unavailable, use defaults
    }

    const context = buildContext(sessionStats, topTraps);

    const result = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    };

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'STL：semantic-linter 已启用；会在指令类文件中检测宽边界词，易使模型输出范围失焦。',
      },
    }));
    process.exit(0);
  }
}
