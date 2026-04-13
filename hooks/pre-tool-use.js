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
const reportFormatter = require(path.join(libDir, 'report-formatter'));
const scanPipeline = require(path.join(libDir, 'scan-pipeline'));

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

  // 提取待写入内容
  let content = '';
  if (toolName === 'Write') {
    content = toolInput.content || '';
  } else if (toolName === 'Edit') {
    content = toolInput.new_string || '';
  }

  if (!content.trim()) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 执行共享扫描管道
  const { lexiconMatches, structuralRisks, totalFindings, ignored } = scanPipeline.runScanPipeline(content, filePath);

  if (ignored || totalFindings === 0) {
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

  // 格式化预警报告（旁白式 STL：…）
  let report = reportFormatter.formatPre(lexiconMatches, structuralRisks, filePath);

  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    report = reportFormatter.appendEscalationToReport(report, esc);
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
