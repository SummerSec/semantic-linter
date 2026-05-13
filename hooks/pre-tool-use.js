#!/usr/bin/env node
/**
 * PreToolUse Hook：语义陷阱写入前预警
 *
 * 事件：PreToolUse（匹配器：Write|Edit）
 * 在文件写入/编辑之前扫描内容中的语义陷阱词汇，
 * 指示 Claude 暂停并向用户展示发现和替换建议。
 */

const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const { readStdin, outputJson, computeEscalation } = require(path.join(libDir, 'hook-utils'));
const fileDetector = require(path.join(libDir, 'file-detector'));
const contentScanner = require(path.join(libDir, 'content-scanner'));
const structuralAnalyzer = require(path.join(libDir, 'structural-analyzer'));
const reportFormatter = require(path.join(libDir, 'report-formatter'));
const configLoader = require(path.join(libDir, 'config-loader'));

const input = readStdin();

try {
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  if (!filePath) outputJson({ continue: true });
  if (!fileDetector.isInstructionFile(filePath)) outputJson({ continue: true });

  const absFile = path.resolve(filePath);
  const cfg = configLoader.loadConfigForFile(absFile);
  if (configLoader.shouldIgnoreFile(absFile, cfg)) outputJson({ continue: true });

  let content = '';
  if (toolName === 'Write') {
    content = toolInput.content || '';
  } else if (toolName === 'Edit') {
    content = toolInput.new_string || '';
  }

  if (!content.trim()) outputJson({ continue: true });

  let lexiconMatches = contentScanner.scan(content);
  lexiconMatches = configLoader.applyConfig(lexiconMatches, [], cfg).lexiconMatches;
  let structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  structuralRisks = configLoader.applyConfig([], structuralRisks, cfg).structuralRisks;

  const totalFindings = lexiconMatches.length + structuralRisks.length;
  if (totalFindings === 0) outputJson({ continue: true });

  let report = reportFormatter.formatPre(lexiconMatches, structuralRisks, filePath);

  const escalation = computeEscalation(libDir);
  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    report = reportFormatter.appendEscalationToReport(report, esc);
  }

  outputJson({ continue: true, systemMessage: report });
} catch {
  outputJson({ continue: true });
}