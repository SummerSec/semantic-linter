#!/usr/bin/env node
/**
 * SessionStart Hook: Inject semantic trap awareness at session start
 *
 * Event: SessionStart (matcher: startup|resume|compact)
 * Injects a brief additionalContext reminding Claude about common
 * semantic trap words and the active linter.
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
  const parts = [
    'Semantic-linter is active. It detects wide-boundary trap words in instruction files that may cause LLM output to exceed intended scope.',
  ];

  // Top trap words
  const traps = (topTraps && topTraps.length > 0)
    ? topTraps.slice(0, 5).map(t => t.trapId).join(', ')
    : DEFAULT_TOP_TRAPS.map(t => `${t.zh}/${t.en} → ${t.narrow}`).join('; ');
  parts.push(`Common traps: ${traps}.`);

  // Session summary if available
  if (sessionStats && sessionStats.detectionCount > 0) {
    parts.push(`Session: ${sessionStats.detectionCount} detections, escalation L${sessionStats.escalationLevel || 0}.`);
  }

  parts.push('PreToolUse and PostToolUse hooks will scan Write/Edit operations on instruction files.');

  return parts.join(' ');
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
        additionalContext: 'Semantic-linter is active. It detects wide-boundary trap words in instruction files.',
      },
    }));
    process.exit(0);
  }
}
