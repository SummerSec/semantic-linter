#!/usr/bin/env node
/**
 * SessionStart Hook: 注入语义约束规则的「按需指针」
 *
 * Event: SessionStart (matcher: startup|resume|compact)
 * 启用插件即在上下文注入一段指针：指向插件自带的 semantic-rules.md 绝对路径，
 * 并说明何时去读。规则全文不常驻上下文，模型在写指令类文件时按需打开该文件，
 * 据其把宽边界用词替换为更窄的用词。
 */

const path = require('path');

// 插件自带的规则文件（由 build-rules 生成，随插件分发，开箱即用）
const RULES_PATH = path.resolve(path.join(__dirname, '..', 'semantic-rules.md'));

/**
 * 构造注入上下文：指向规则文件 + 何时去读。
 * @param {string} rulesPath - semantic-rules.md 的绝对路径
 * @returns {string}
 */
function buildContext(rulesPath) {
  return `STL：semantic-linter 已启用。语义约束规则文件位于 ${rulesPath}。`
    + `编写或修改 skill / agent / command / prompt 等指令类文件前，先读该文件，`
    + `据其把宽边界用词替换为更窄的用词；必须保留宽边界词时，套用其中的边界锚定策略。`;
}

// Export for testing
module.exports = { buildContext, RULES_PATH };

// Only execute when run directly (not when required by tests)
if (require.main === module) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: buildContext(RULES_PATH),
    },
  }));
  process.exit(0);
}
