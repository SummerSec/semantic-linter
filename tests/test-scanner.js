#!/usr/bin/env node
/**
 * semantic-linter 各模块单元测试
 * 使用 Node.js 内置 assert 模块（零依赖）
 */

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const libDir = path.join(__dirname, '..', 'plugin', 'lib');
const fileDetector = require(path.join(libDir, 'file-detector'));
const contentScanner = require(path.join(libDir, 'content-scanner'));
const structuralAnalyzer = require(path.join(libDir, 'structural-analyzer'));
const reportFormatter = require(path.join(libDir, 'report-formatter'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ========== 文件检测器测试 ==========
console.log('\n--- 文件检测器 (file-detector) ---');

test('检测 SKILL.md', () => {
  assert.ok(fileDetector.isInstructionFile('/path/to/skills/my-skill/SKILL.md'));
});

test('检测 skill.md（不区分大小写）', () => {
  assert.ok(fileDetector.isInstructionFile('/path/to/skills/my-skill/skill.md'));
});

test('检测 CLAUDE.md', () => {
  assert.ok(fileDetector.isInstructionFile('/home/user/.claude/CLAUDE.md'));
});

test('检测 skills/ 目录下的文件', () => {
  assert.ok(fileDetector.isInstructionFile('/home/user/.claude/skills/my-skill/references/defs.md'));
});

test('检测 agents/ 目录下的文件', () => {
  assert.ok(fileDetector.isInstructionFile('/home/user/.claude/agents/reviewer.md'));
});

test('检测 rules/ 目录下的文件', () => {
  assert.ok(fileDetector.isInstructionFile('/home/user/.claude/rules/coding-style.md'));
});

test('检测 _definitions.md 文件', () => {
  assert.ok(fileDetector.isInstructionFile('/path/to/vul_definitions.md'));
});

test('检测 _examples.md 文件', () => {
  assert.ok(fileDetector.isInstructionFile('/path/to/vul_assessment_examples.md'));
});

test('拒绝普通 .js 文件', () => {
  assert.ok(!fileDetector.isInstructionFile('/path/to/index.js'));
});

test('拒绝指令目录外的普通 .md 文件', () => {
  assert.ok(!fileDetector.isInstructionFile('/path/to/notes.md'));
});

test('拒绝非 .md 文件', () => {
  assert.ok(!fileDetector.isInstructionFile('/path/to/config.json'));
});

test('处理空路径', () => {
  assert.ok(!fileDetector.isInstructionFile(''));
});

// ========== 内容扫描器测试 ==========
console.log('\n--- 内容扫描器 (content-scanner) ---');

test('检测中文宽边界词"风险"', () => {
  const matches = contentScanner.scan('请检查这段代码的风险');
  assert.ok(matches.length > 0);
  assert.strictEqual(matches[0].trapId, 'T01');
  assert.strictEqual(matches[0].word, '风险');
  assert.strictEqual(matches[0].replacement, '漏洞');
});

test('检测中文宽边界词"审查"', () => {
  const matches = contentScanner.scan('请审查这段代码');
  assert.ok(matches.length > 0);
  assert.strictEqual(matches[0].trapId, 'T02');
  assert.strictEqual(matches[0].word, '审查');
});

test('检测中文宽边界词"问题"', () => {
  const matches = contentScanner.scan('只关注定义文件中的问题类型');
  assert.ok(matches.length > 0);
  const m = matches.find(m => m.trapId === 'T04');
  assert.ok(m);
  assert.strictEqual(m.contextRole, 'constraint_keyword');
});

test('检测英文宽边界词"risk"', () => {
  const matches = contentScanner.scan('Evaluate the risk of this API');
  const m = matches.find(m => m.trapId === 'E01');
  assert.ok(m);
  assert.strictEqual(m.replacement, 'Vulnerability');
});

test('检测英文宽边界词"review"', () => {
  const matches = contentScanner.scan('Please review this code for issues');
  const reviewMatch = matches.find(m => m.word.toLowerCase() === 'review');
  assert.ok(reviewMatch);
});

test('不标记窄边界词', () => {
  const matches = contentScanner.scan('请检查这段代码是否存在SQL注入漏洞，列出所有发现的缺陷');
  assert.strictEqual(matches.length, 0);
});

test('跳过代码块中的内容', () => {
  const content = '正文\n```\n请审查这段代码的风险\n```\n正文继续';
  const matches = contentScanner.scan(content);
  assert.strictEqual(matches.length, 0);
});

test('跳过行内代码中的内容', () => {
  const matches = contentScanner.scan('使用 `风险` 这个词');
  assert.strictEqual(matches.length, 0);
});

test('同一词在多行出现时去重', () => {
  const content = '请审查代码\n再次审查';
  const matches = contentScanner.scan(content);
  const reviewMatches = matches.filter(m => m.word === '审查');
  assert.strictEqual(reviewMatches.length, 1);
});

test('正确分类约束上下文', () => {
  const matches = contentScanner.scan('只关注风险定义文件中定义的风险类型');
  const m = matches.find(m => m.word === '风险');
  assert.ok(m);
  assert.strictEqual(m.contextRole, 'constraint_keyword');
});

test('正确分类任务目标上下文', () => {
  const matches = contentScanner.scan('请对代码进行分析');
  const m = matches.find(m => m.word === '分析');
  assert.ok(m);
  assert.strictEqual(m.contextRole, 'task_target');
});

// ========== 结构分析器测试 ==========
console.log('\n--- 结构分析器 (structural-analyzer) ---');

test('检测中文开放式动词（缺少范围限定）', () => {
  const results = structuralAnalyzer.analyze('分析代码', []);
  const finding = results.find(r => r.type === 'open_ended_verb');
  assert.ok(finding);
});

test('有范围限定时不误报（中文）', () => {
  const results = structuralAnalyzer.analyze('分析代码中的以下漏洞类型', []);
  const finding = results.find(r => r.type === 'open_ended_verb' && r.context.includes('分析'));
  assert.ok(!finding);
});

test('检测英文开放式动词（缺少范围限定）', () => {
  const results = structuralAnalyzer.analyze('Analyze the code', []);
  const finding = results.find(r => r.type === 'open_ended_verb');
  assert.ok(finding);
});

test('检测中文抽象化目标', () => {
  const results = structuralAnalyzer.analyze('评估代码的安全性', []);
  const finding = results.find(r => r.type === 'adjective_target');
  assert.ok(finding);
});

test('检测约束条件中的情态动词降级', () => {
  const results = structuralAnalyzer.analyze('规则：你应该只关注安全问题', []);
  const finding = results.find(r => r.type === 'modal_downgrade');
  assert.ok(finding);
});

test('检测缺少否定清单', () => {
  const mockMatches = [{ word: '风险', severity: 'critical' }];
  const results = structuralAnalyzer.analyze('检查代码风险', mockMatches);
  const finding = results.find(r => r.type === 'missing_negation');
  assert.ok(finding);
});

test('存在否定清单时不报告', () => {
  const mockMatches = [{ word: '风险', severity: 'critical' }];
  const results = structuralAnalyzer.analyze('检查风险\n\n以下不属于评估范围', mockMatches);
  const finding = results.find(r => r.type === 'missing_negation');
  assert.ok(!finding);
});

// ========== 报告格式化器测试 ==========
console.log('\n--- 报告格式化器 (report-formatter) ---');

test('无发现时 format 返回空字符串', () => {
  const result = reportFormatter.format([], [], '/path/to/SKILL.md');
  assert.strictEqual(result, '');
});

test('无发现时 formatPre 返回空字符串', () => {
  const result = reportFormatter.formatPre([], [], '/path/to/SKILL.md');
  assert.strictEqual(result, '');
});

test('format（PostToolUse）生成确认语气报告', () => {
  const matches = [{
    trapId: 'T02', word: '审查', replacement: '检查',
    replacementEn: 'Check', severity: 'high',
    contextRole: 'constraint_keyword', line: 3,
    context: '只审查定义文件中的类型',
  }];
  const report = reportFormatter.format(matches, [], '/path/to/SKILL.md');
  assert.ok(report.includes('写入后确认'));
  assert.ok(report.includes('T02'));
  assert.ok(report.includes('审查'));
  assert.ok(report.includes('检查'));
  assert.ok(report.includes('请告知用户'));
});

test('formatPre（PreToolUse）生成预警语气报告', () => {
  const matches = [{
    trapId: 'T01', word: '风险', replacement: '漏洞',
    replacementEn: 'Vulnerability', severity: 'critical',
    contextRole: 'task_target', line: 5,
    context: '请分析代码中的风险',
  }];
  const report = reportFormatter.formatPre(matches, [], '/path/to/SKILL.md');
  assert.ok(report.includes('写入前预警'));
  assert.ok(report.includes('暂停当前写入任务'));
  assert.ok(report.includes('执行指令'));
  assert.ok(report.includes('风险'));
  assert.ok(report.includes('漏洞'));
});

test('formatPre 包含可操作的替换方案', () => {
  const matches = [{
    trapId: 'T01', word: '风险', replacement: '漏洞',
    severity: 'critical', contextRole: 'task_target',
    line: 12, context: '请分析代码中的风险',
  }];
  const report = reportFormatter.formatPre(matches, [], '/path/to/SKILL.md');
  assert.ok(report.includes('可直接应用的替换方案'));
  assert.ok(report.includes('第12行'));
  assert.ok(report.includes('"风险" → "漏洞"'));
});

test('buildReplacements 生成替换列表', () => {
  const matches = [
    { trapId: 'T01', word: '风险', replacement: '漏洞', severity: 'critical', line: 3, context: '' },
    { trapId: 'T02', word: '审查', replacement: '检查', severity: 'high', line: 7, context: '' },
  ];
  const replacements = reportFormatter.buildReplacements(matches);
  assert.ok(replacements.includes('第3行'));
  assert.ok(replacements.includes('"风险" → "漏洞"'));
  assert.ok(replacements.includes('第7行'));
  assert.ok(replacements.includes('"审查" → "检查"'));
});

test('buildReplacements 空匹配返回空字符串', () => {
  assert.strictEqual(reportFormatter.buildReplacements([]), '');
});

test('format 包含结构性风险', () => {
  const risks = [{
    type: 'open_ended_verb', severity: 'medium',
    line: 5, context: '分析代码',
    suggestion: '添加具体范围',
  }];
  const report = reportFormatter.format([], risks, '/path/to/SKILL.md');
  assert.ok(report.includes('结构性风险'));
  assert.ok(report.includes('开放式动词'));
});

test('formatCli 无发现时显示绿色通过', () => {
  const result = reportFormatter.formatCli([], [], '/path/to/SKILL.md');
  assert.ok(result.includes('未发现语义陷阱'));
});

test('formatCli 有发现时包含 ANSI 颜色码', () => {
  const matches = [{
    trapId: 'T01', word: '风险', replacement: '漏洞',
    severity: 'critical', contextRole: 'task_target',
    line: 5, context: '请分析代码中的风险',
  }];
  const result = reportFormatter.formatCli(matches, [], '/path/to/SKILL.md');
  assert.ok(result.includes('\x1b[31m')); // 红色
  assert.ok(result.includes('风险'));
  assert.ok(result.includes('漏洞'));
});

test('computeOverallRisk 返回最高风险等级', () => {
  const matches = [
    { severity: 'medium' },
    { severity: 'critical' },
  ];
  const risk = reportFormatter.computeOverallRisk(matches, []);
  assert.strictEqual(risk, 'CRITICAL');
});

// ========== CLI 工具测试 ==========
console.log('\n--- CLI 工具 (bin/scan.js) ---');

const scanBin = path.join(__dirname, '..', 'bin', 'scan.js');
const fixturesDir = path.join(__dirname, 'fixtures');

test('CLI 扫描含陷阱词的文件（退出码 1）', () => {
  const sampleFile = path.join(fixturesDir, 'sample-skill.md');
  try {
    execFileSync('node', [scanBin, sampleFile], { encoding: 'utf8' });
    assert.fail('应该以退出码 1 退出');
  } catch (err) {
    assert.strictEqual(err.status, 1);
    assert.ok(err.stdout.includes('风险'));
  }
});

test('CLI 扫描干净文件（退出码 0）', () => {
  const cleanFile = path.join(fixturesDir, 'clean-skill.md');
  const output = execFileSync('node', [scanBin, cleanFile], { encoding: 'utf8' });
  assert.ok(output.includes('问题总数: 0') || output.includes('未发现语义陷阱'));
});

test('CLI --json 输出有效 JSON', () => {
  const sampleFile = path.join(fixturesDir, 'sample-skill.md');
  try {
    execFileSync('node', [scanBin, '--json', sampleFile], { encoding: 'utf8' });
    assert.fail('应该以退出码 1 退出');
  } catch (err) {
    assert.strictEqual(err.status, 1);
    const json = JSON.parse(err.stdout);
    assert.ok(json.version);
    assert.ok(json.files);
    assert.ok(json.summary);
    assert.ok(json.summary.totalFindings > 0);
  }
});

test('CLI 扫描目录（含 skills/ 子目录）', () => {
  try {
    execFileSync('node', [scanBin, fixturesDir], { encoding: 'utf8' });
    assert.fail('应该以退出码 1 退出（目录含有问题文件）');
  } catch (err) {
    assert.strictEqual(err.status, 1);
    assert.ok(err.stdout.includes('扫描结果'));
    assert.ok(err.stdout.includes('风险'));
  }
});

test('CLI 不存在的路径（退出码 2）', () => {
  try {
    execFileSync('node', [scanBin, '/nonexistent/path'], { encoding: 'utf8' });
    assert.fail('应该以退出码 2 退出');
  } catch (err) {
    assert.strictEqual(err.status, 2);
  }
});

test('CLI --help 显示帮助', () => {
  const output = execFileSync('node', [scanBin, '--help'], { encoding: 'utf8' });
  assert.ok(output.includes('semantic-linter'));
  assert.ok(output.includes('--all'));
  assert.ok(output.includes('--json'));
});

// ========== 测试结果汇总 ==========
console.log(`\n--- 结果：${passed} 个通过, ${failed} 个失败 ---\n`);
process.exit(failed > 0 ? 1 : 0);
