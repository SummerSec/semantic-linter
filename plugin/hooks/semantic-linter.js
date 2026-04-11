#!/usr/bin/env node
/**
 * PostToolUse Hook：语义陷阱检测器
 *
 * 事件：PostToolUse（匹配器：Write|Edit）
 * 扫描 Skill/Prompt/Agent 指令文件中的语义陷阱词汇，
 * 并将警告注入 Claude 的上下文。
 */

const fs = require('fs');
const path = require('path');

// 基于当前脚本位置解析 lib 目录路径
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

  // 获取文件内容
  let content = '';
  if (toolName === 'Write' && toolInput.content) {
    // Write 工具提供完整内容
    content = toolInput.content;
  } else {
    // Edit 工具：从磁盘读取（PostToolUse 时文件已更新）
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      // 文件可能不存在或不可读
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    }
  }

  if (!content.trim()) {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // 执行检测（先过滤词典命中，再结构分析）
  let lexiconMatches = contentScanner.scan(content);
  lexiconMatches = configLoader.applyConfig(lexiconMatches, [], cfg).lexiconMatches;
  let structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  structuralRisks = configLoader.applyConfig([], structuralRisks, cfg).structuralRisks;

  const totalFindings = lexiconMatches.length + structuralRisks.length;

  if (totalFindings === 0) {
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

  // 格式化报告
  let report = reportFormatter.format(lexiconMatches, structuralRisks, filePath);

  // Apply escalation suffix if applicable
  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    if (esc.prefix) {
      report = report.replace('### ✅ 语义陷阱检测器', `### ${esc.prefix}✅ 语义陷阱检测器`);
    }
    if (esc.suffix) {
      report += '\n' + esc.suffix;
    }
  }

  // 输出确认报告到 Claude 上下文（主动提示用户）
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
