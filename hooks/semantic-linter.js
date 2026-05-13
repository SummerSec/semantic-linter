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

const libDir = path.join(__dirname, '..', 'lib');
const { readStdin, outputJson, computeEscalation, recordDetection } = require(path.join(libDir, 'hook-utils'));
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
  if (toolName === 'Write' && toolInput.content) {
    content = toolInput.content;
  } else {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      outputJson({ continue: true });
    }
  }

  if (!content.trim()) outputJson({ continue: true });

  let lexiconMatches = contentScanner.scan(content);
  lexiconMatches = configLoader.applyConfig(lexiconMatches, [], cfg).lexiconMatches;
  let structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  structuralRisks = configLoader.applyConfig([], structuralRisks, cfg).structuralRisks;

  const totalFindings = lexiconMatches.length + structuralRisks.length;
  if (totalFindings === 0) outputJson({ continue: true });

  for (const m of lexiconMatches) {
    recordDetection(libDir, m.trapId, m.word, filePath);
  }

  let report = reportFormatter.format(lexiconMatches, structuralRisks, filePath);

  const escalation = computeEscalation(libDir);
  if (escalation) {
    const esc = reportFormatter.buildEscalation(escalation.level, escalation.sessionTraps);
    report = reportFormatter.appendEscalationToReport(report, esc);
  }

  outputJson({ continue: true, systemMessage: report });
} catch {
  outputJson({ continue: true });
}