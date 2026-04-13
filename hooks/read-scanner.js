#!/usr/bin/env node
/**
 * PostToolUse Hook：读取后语义陷阱提示
 *
 * 事件：PostToolUse（匹配器：Read）
 * 当 Claude 读取 Skill/Prompt/Agent 指令文件后，
 * 扫描内容中的语义陷阱词汇并提示修复建议。
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
  const toolInput = input.tool_input || {};
  const toolResponse = input.tool_response;

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

  // 从 tool_response 提取文件内容
  let content = '';
  if (typeof toolResponse === 'string') {
    // Read 工具返回 cat -n 格式：「行号\t内容」逐行
    content = toolResponse
      .split('\n')
      .map((line) => line.replace(/^\d+\t/, ''))
      .join('\n');
  } else if (toolResponse && typeof toolResponse === 'object') {
    content = toolResponse.content || '';
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

  // Escalation integration (fault-tolerant)
  let escalation = null;
  try {
    const stateManager = require(path.join(libDir, 'state-manager'));
    for (const m of lexiconMatches) {
      stateManager.recordDetection(m.trapId, m.word, filePath);
    }
    const level = stateManager.computeEscalationLevel();
    if (level > 0) {
      const session = stateManager.getSessionStats();
      escalation = { level, sessionTraps: session.trapOccurrences };
    }
  } catch {
    // state-manager unavailable, proceed without escalation
  }

  let report = reportFormatter.formatRead(lexiconMatches, structuralRisks, filePath);

  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    report = reportFormatter.appendEscalationToReport(report, esc);
  }

  // 输出读取提示到 Claude 上下文
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
