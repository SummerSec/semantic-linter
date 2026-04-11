#!/usr/bin/env node
/**
 * PreToolUse Hook：语义陷阱写入前预警
 *
 * 事件：PreToolUse（匹配器：Write|Edit）
 * 在文件写入/编辑之前扫描内容中的语义陷阱词汇，
 * 指示 Claude 暂停并向用户展示发现和替换建议。
 */

const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const fileDetector = require(path.join(libDir, 'file-detector'));
const contentScanner = require(path.join(libDir, 'content-scanner'));
const structuralAnalyzer = require(path.join(libDir, 'structural-analyzer'));
const reportFormatter = require(path.join(libDir, 'report-formatter'));
const configLoader = require(path.join(libDir, 'config-loader'));

// 读取 stdin 输入
let input = {};
try {
  const stdinData = fs.readFileSync(0, 'utf8');
  if (stdinData.trim()) {
    input = JSON.parse(stdinData);
  }
} catch {
  // 使用默认空对象
}

try {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // 从工具输入中提取文件路径
  const filePath = toolInput.file_path || '';

  if (!filePath) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 检查是否为指令文件
  if (!fileDetector.isInstructionFile(filePath)) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const absFile = path.resolve(filePath);
  const cfg = configLoader.loadConfigForFile(absFile);
  if (configLoader.shouldIgnoreFile(absFile, cfg)) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 提取待写入内容
  let content = '';
  if (toolName === 'Write') {
    // Write 工具：从 tool_input.content 获取完整内容
    content = toolInput.content || '';
  } else if (toolName === 'Edit') {
    // Edit 工具：仅扫描 new_string（文件尚未修改，不能读磁盘）
    content = toolInput.new_string || '';
  }

  if (!content.trim()) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 执行检测（先过滤词典命中，再结构分析，以便 missing_negation 等与词典一致）
  let lexiconMatches = contentScanner.scan(content);
  lexiconMatches = configLoader.applyConfig(lexiconMatches, [], cfg).lexiconMatches;
  let structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  structuralRisks = configLoader.applyConfig([], structuralRisks, cfg).structuralRisks;

  const totalFindings = lexiconMatches.length + structuralRisks.length;

  if (totalFindings === 0) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 升级提示仅基于历史记录（写入计数在 PostToolUse 完成，避免同一轮 Pre+Post 重复计数）
  let escalation = null;
  try {
    const stateManager = require(path.join(libDir, 'state-manager'));
    const level = stateManager.computeEscalationLevel();
    if (level > 0) {
      const session = stateManager.getSessionStats();
      escalation = { level, sessionTraps: session.trapOccurrences };
    }
  } catch {
    // state-manager unavailable, proceed without escalation
  }

  // 格式化预警报告
  let report = reportFormatter.formatPre(lexiconMatches, structuralRisks, filePath);

  // Apply escalation suffix if applicable
  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    if (esc.prefix) {
      report = report.replace('### 🚨 语义陷阱检测器', `### ${esc.prefix}🚨 语义陷阱检测器`);
    }
    if (esc.suffix) {
      report += '\n' + esc.suffix;
    }
  }

  // 输出预警到 Claude 上下文（不阻断写入）
  const result = {
    continue: true,
    systemMessage: report,
  };

  console.log(JSON.stringify(result));
  process.exit(0);

} catch (err) {
  // 永不中断 hook 管道
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}
