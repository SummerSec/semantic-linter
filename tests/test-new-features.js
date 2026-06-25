#!/usr/bin/env node
/**
 * Tests for new features: state-manager, SessionStart hook,
 * UserPromptSubmit hook, escalation, plugin.json, benchmarks
 *
 * Uses Node.js built-in assert (zero dependencies)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { test, summary, exitOnFailure, getPassed, getFailed, assert } = require('./helpers');

// ========== State Manager Tests ==========
console.log('\n--- State Manager (state-manager) ---');

// Create a temp directory for state tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-linter-test-'));
process.env.SEMANTIC_LINTER_STATE_DIR = tmpDir;

// Re-require state-manager after setting env var
delete require.cache[require.resolve(path.join(__dirname, '..', 'lib', 'state-manager'))];
const stateManager = require(path.join(__dirname, '..', 'lib', 'state-manager'));

test('initState creates directory and files', () => {
  stateManager.initState();
  assert.ok(fs.existsSync(tmpDir));
  assert.ok(fs.existsSync(path.join(tmpDir, 'stats.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'session.json')));
});

test('initState handles existing directory gracefully', () => {
  stateManager.initState();
  stateManager.initState(); // second call should not throw
  assert.ok(fs.existsSync(tmpDir));
});

test('recordDetection increments trap frequency in stats', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/test/file.md');
  const statsRaw = fs.readFileSync(path.join(tmpDir, 'stats.json'), 'utf8');
  const stats = JSON.parse(statsRaw);
  assert.ok(stats.trapFrequency.T01);
  assert.ok(stats.trapFrequency.T01.count >= 1);
});

test('recordDetection increments session detection count', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/test/a.md');
  const session = stateManager.getSessionStats();
  assert.ok(session.detectionCount >= 1);
});

test('recordDetection tracks file paths per trap', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/test/a.md');
  stateManager.recordDetection('T01', '风险', '/test/b.md');
  const session = stateManager.getSessionStats();
  assert.ok(session.trapOccurrences.T01.files.includes('/test/a.md'));
  assert.ok(session.trapOccurrences.T01.files.includes('/test/b.md'));
});

test('getSessionStats returns current session data', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T02', '审查', '/test/c.md');
  const session = stateManager.getSessionStats();
  assert.strictEqual(typeof session.sessionId, 'string');
  assert.strictEqual(typeof session.detectionCount, 'number');
  assert.ok(session.trapOccurrences.T02);
});

test('getSessionStats auto-resets stale session (>2h)', () => {
  // Write a session with old updatedAt
  const staleSession = {
    version: 1,
    sessionId: 'stale',
    startedAt: '2020-01-01T00:00:00Z',
    updatedAt: '2020-01-01T00:00:00Z',
    detectionCount: 99,
    escalationLevel: 3,
    trapOccurrences: {},
    filesScanned: [],
  };
  fs.writeFileSync(path.join(tmpDir, 'session.json'), JSON.stringify(staleSession));
  // Re-require to pick up fresh file
  const session = stateManager.getSessionStats();
  assert.strictEqual(session.detectionCount, 0);
  assert.notStrictEqual(session.sessionId, 'stale');
});

test('getTopTraps returns top N sorted by count', () => {
  // Reset stats
  fs.writeFileSync(path.join(tmpDir, 'stats.json'), JSON.stringify({
    version: 1,
    totalDetections: 10,
    trapFrequency: {
      T01: { count: 5, lastSeen: '' },
      T02: { count: 3, lastSeen: '' },
      T05: { count: 8, lastSeen: '' },
    },
    wordFrequency: {},
  }));
  const top = stateManager.getTopTraps(2);
  assert.strictEqual(top.length, 2);
  assert.strictEqual(top[0].trapId, 'T05');
  assert.strictEqual(top[1].trapId, 'T01');
});

test('computeEscalationLevel returns L0 for fresh session', () => {
  stateManager.resetSession();
  assert.strictEqual(stateManager.computeEscalationLevel(), 0);
});

test('computeEscalationLevel returns L1 for 2x same trap', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/a.md');
  stateManager.recordDetection('T01', '风险', '/a.md');
  assert.strictEqual(stateManager.computeEscalationLevel(), 1);
});

test('computeEscalationLevel returns L2 for 3x same trap', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/a.md');
  stateManager.recordDetection('T01', '风险', '/a.md');
  stateManager.recordDetection('T01', '风险', '/a.md');
  assert.strictEqual(stateManager.computeEscalationLevel(), 2);
});

test('computeEscalationLevel returns L3 for cross-file persistent traps', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/a.md');
  stateManager.recordDetection('T02', '审查', '/b.md');
  stateManager.recordDetection('T04', '问题', '/c.md');
  stateManager.recordDetection('T05', '分析', '/d.md');
  stateManager.recordDetection('T08', '改善', '/e.md');
  assert.strictEqual(stateManager.computeEscalationLevel(), 3);
});

test('resetSession clears session state', () => {
  stateManager.recordDetection('T01', '风险', '/test.md');
  stateManager.resetSession();
  const session = stateManager.getSessionStats();
  assert.strictEqual(session.detectionCount, 0);
  assert.deepStrictEqual(session.trapOccurrences, {});
});

test('state-manager handles corrupted stats.json gracefully', () => {
  fs.writeFileSync(path.join(tmpDir, 'stats.json'), 'NOT JSON!!!');
  const top = stateManager.getTopTraps(5);
  assert.ok(Array.isArray(top));
});

// ========== SessionStart Hook Tests ==========
console.log('\n--- SessionStart Hook (session-start) ---');

const { buildContext, RULES_PATH } = require(path.join(__dirname, '..', 'hooks', 'session-start'));

test('buildContext 注入 STL 前缀与启用说明', () => {
  const ctx = buildContext('/x/semantic-rules.md');
  assert.ok(ctx.startsWith('STL：'));
  assert.ok(ctx.includes('semantic-linter 已启用'));
});

test('buildContext 注入规则文件路径', () => {
  const ctx = buildContext('/abs/path/semantic-rules.md');
  assert.ok(ctx.includes('/abs/path/semantic-rules.md'));
});

test('buildContext 指引何时去读规则文件', () => {
  const ctx = buildContext('/x/semantic-rules.md');
  assert.ok(ctx.includes('指令'));
  assert.ok(ctx.includes('窄'));
});

test('RULES_PATH 指向插件自带的 semantic-rules.md', () => {
  assert.ok(RULES_PATH.endsWith('semantic-rules.md'));
  assert.ok(path.isAbsolute(RULES_PATH));
});

test('buildContext output is under 500 characters', () => {
  const ctx = buildContext(RULES_PATH);
  assert.ok(ctx.length < 500, `Context too long: ${ctx.length} chars`);
});

// ========== PromptScanner / formatPromptWarning Tests ==========
console.log('\n--- UserPromptSubmit Hook (prompt-scanner) ---');

const reportFormatter = require(path.join(__dirname, '..', 'lib', 'report-formatter'));

test('formatPromptWarning returns empty for no matches', () => {
  assert.strictEqual(reportFormatter.formatPromptWarning([]), '');
});

test('formatPromptWarning lists all found trap words', () => {
  const matches = [
    { word: '风险', replacement: '漏洞', trapId: 'T01' },
    { word: '审查', replacement: '检查', trapId: 'T02' },
  ];
  const warning = reportFormatter.formatPromptWarning(matches);
  assert.ok(warning.includes('「风险」'));
  assert.ok(warning.includes('「审查」'));
  assert.ok(warning.includes('漏洞'));
  assert.ok(warning.includes('检查'));
  assert.ok(warning.includes('2 处宽边界词'));
});

test('formatPromptWarning generates single-paragraph output', () => {
  const matches = [{ word: 'risk', replacement: 'Vulnerability', trapId: 'E01' }];
  const warning = reportFormatter.formatPromptWarning(matches);
  // Should not contain markdown headers or table markers
  assert.ok(!warning.includes('###'));
  assert.ok(!warning.includes('|'));
  assert.ok(warning.includes('STL：'));
});

test('formatPromptWarning mentions scope issue', () => {
  const matches = [{ word: 'analyze', replacement: 'Summarize', trapId: 'E05' }];
  const warning = reportFormatter.formatPromptWarning(matches);
  assert.ok(warning.includes('超出预期范围'));
});

// ========== Escalation Tests ==========
console.log('\n--- Escalation System (buildEscalation) ---');

test('buildEscalation returns empty for L0', () => {
  const esc = reportFormatter.buildEscalation(0, {});
  assert.strictEqual(esc.prefix, '');
  assert.strictEqual(esc.suffix, '');
});

test('buildEscalation returns note for L1', () => {
  const esc = reportFormatter.buildEscalation(1, { T01: { count: 2, files: ['/a.md'] } });
  assert.strictEqual(esc.prefix, '');
  assert.ok(esc.suffix.includes('升级提示（注意）'));
  assert.ok(esc.suffix.includes('多次出现'));
});

test('buildEscalation L2 旁白含重复提示', () => {
  const esc = reportFormatter.buildEscalation(2, { T01: { count: 3, files: ['/a.md'] } });
  assert.strictEqual(esc.prefix, '');
  assert.ok(esc.suffix.includes('升级提示（重复）'));
  assert.ok(esc.suffix.includes('3 次及以上'));
});

test('buildEscalation L3 旁白含持续提示与 CLAUDE.md', () => {
  const traps = {
    T01: { count: 3, files: ['/a.md', '/b.md'] },
    T02: { count: 2, files: ['/c.md'] },
  };
  const esc = reportFormatter.buildEscalation(3, traps);
  assert.strictEqual(esc.prefix, '');
  assert.ok(esc.suffix.includes('升级提示（持续）'));
  assert.ok(esc.suffix.includes('CLAUDE.md'));
});

test('buildEscalation L3 shows correct file count', () => {
  const traps = {
    T01: { count: 2, files: ['/a.md', '/b.md', '/c.md'] },
  };
  const esc = reportFormatter.buildEscalation(3, traps);
  assert.ok(esc.suffix.includes('3 个文件'));
});

test('appendEscalationToReport 将升级旁白拼在报告末尾', () => {
  const matches = [{
    trapId: 'T01', word: '风险', replacement: '漏洞',
    severity: 'critical', contextRole: 'task_target', line: 1, context: '',
  }];
  const base = reportFormatter.formatPre(matches, [], '/proj/skills/x/SKILL.md');
  const esc = reportFormatter.buildEscalation(2, { T01: { count: 3, files: ['/a.md'] } });
  const merged = reportFormatter.appendEscalationToReport(base, esc);
  assert.ok(merged.startsWith('STL：'));
  assert.ok(merged.includes('升级提示（重复）'));
  assert.ok(merged.length > base.length);
});

test('buildEscalation with null returns empty for L0', () => {
  const esc = reportFormatter.buildEscalation(null, null);
  assert.strictEqual(esc.prefix, '');
  assert.strictEqual(esc.suffix, '');
});

// ========== Config, meta, lexicon build ==========
console.log('\n--- Config / meta / build-lexicon ---');

test('package.json 与 plugin.json 版本号一致', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const claudePlug = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
  const codexPlug = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.codex-plugin', 'plugin.json'), 'utf8'));
  const claudeMarket = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(pkg.version, claudePlug.version);
  assert.strictEqual(pkg.version, codexPlug.version);
  assert.strictEqual(pkg.version, claudeMarket.plugins[0].version);
});

test('meta.getToolVersion 可读', () => {
  const meta = require(path.join(__dirname, '..', 'lib', 'meta'));
  assert.ok(/^\d+\.\d+\.\d+/.test(meta.getToolVersion()));
});

test('config-loader 按 ignoreTrapIds / ignoreStructuralTypes 过滤', () => {
  const configLoader = require(path.join(__dirname, '..', 'lib', 'config-loader'));
  const contentScanner = require(path.join(__dirname, '..', 'lib', 'content-scanner'));
  const structuralAnalyzer = require(path.join(__dirname, '..', 'lib', 'structural-analyzer'));
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cfg-'));
  fs.mkdirSync(path.join(cfgDir, 'skills'), { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, '.semantic-linter.json'),
    JSON.stringify({ ignoreTrapIds: ['T01'], ignoreStructuralTypes: ['open_ended_verb'] })
  );
  const skillPath = path.join(cfgDir, 'skills', 'a.md');
  // T01 过滤后不留其他宽词；第二行用「检视」触发开放式动词（该词不在词典宽边界表中）
  const body = '文本风险\n检视代码';
  fs.writeFileSync(skillPath, body);
  const cfg = configLoader.loadConfigForFile(skillPath);
  assert.ok(cfg.ignoreTrapIds.has('T01'));
  let lex = contentScanner.scan(body);
  lex = configLoader.applyConfig(lex, [], cfg).lexiconMatches;
  assert.strictEqual(lex.length, 0);
  let struct = structuralAnalyzer.analyze(body, lex);
  struct = configLoader.applyConfig([], struct, cfg).structuralRisks;
  assert.ok(!struct.some((r) => r.type === 'open_ended_verb'));
});

test('build-lexicon --check 通过', () => {
  const root = path.join(__dirname, '..');
  execFileSync('node', [path.join(root, 'scripts', 'build-lexicon.js'), '--check'], {
    encoding: 'utf8',
    cwd: root,
  });
});

// ========== build-rules（目标指令文件指针 + semantic-rules.md 规则）==========
console.log('\n--- build-rules ---');

const ROOT_FOR_RULES = path.join(__dirname, '..');
const BUILD_RULES = path.join(ROOT_FOR_RULES, 'scripts', 'build-rules.js');
const RULES_BEGIN = '<!-- STL:RULES:BEGIN -->';
const RULES_END = '<!-- STL:RULES:END -->';

function runBuildRules(args, cwd) {
  return execFileSync('node', [BUILD_RULES, ...args], { encoding: 'utf8', cwd });
}

// 供「指针不含陷阱词」断言使用
const contentScanner = require(path.join(ROOT_FOR_RULES, 'lib', 'content-scanner'));
const structuralAnalyzer = require(path.join(ROOT_FOR_RULES, 'lib', 'structural-analyzer'));

// 在临时目录生成双文件，返回 { dir, claudeMd, rulesFile }
function genInTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rules-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  runBuildRules([claudeMd], ROOT_FOR_RULES);
  return { dir, claudeMd, rulesFile: path.join(dir, 'semantic-rules.md') };
}

test('build-rules 生成 CLAUDE.md 指针 + semantic-rules.md 规则文件', () => {
  const { claudeMd, rulesFile } = genInTmp();
  const pointer = fs.readFileSync(claudeMd, 'utf8');
  // CLAUDE.md：含 marker、指向规则文件、说明何时读
  assert.ok(pointer.includes(RULES_BEGIN) && pointer.includes(RULES_END));
  assert.ok(pointer.includes('semantic-rules.md'));
  // 规则全文不再塞进 CLAUDE.md 受管区（四维等内容应在规则文件里）
  assert.ok(!pointer.includes('边界锚定三策略'));
  // 规则文件：含四维、锚定、自查
  assert.ok(fs.existsSync(rulesFile));
  const rules = fs.readFileSync(rulesFile, 'utf8');
  assert.ok(rules.includes('程度性'));
  assert.ok(rules.includes('边界锚定三策略'));
});

test('build-rules 可生成 AGENTS.md 指针 + semantic-rules.md 规则文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-agents-'));
  const agentsMd = path.join(dir, 'AGENTS.md');
  runBuildRules([agentsMd], ROOT_FOR_RULES);
  const pointer = fs.readFileSync(agentsMd, 'utf8');
  assert.ok(pointer.includes(RULES_BEGIN) && pointer.includes(RULES_END));
  assert.ok(pointer.includes('semantic-rules.md'));
  assert.ok(fs.existsSync(path.join(dir, 'semantic-rules.md')));
  runBuildRules(['--check', agentsMd], ROOT_FOR_RULES);
});

test('build-rules 支持一次写入 CLAUDE.md 与 AGENTS.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-both-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  const agentsMd = path.join(dir, 'AGENTS.md');
  runBuildRules([claudeMd, agentsMd], ROOT_FOR_RULES);
  assert.ok(fs.readFileSync(claudeMd, 'utf8').includes(RULES_BEGIN));
  assert.ok(fs.readFileSync(agentsMd, 'utf8').includes(RULES_BEGIN));
  assert.ok(fs.existsSync(path.join(dir, 'semantic-rules.md')));
  runBuildRules(['--check', claudeMd, agentsMd], ROOT_FOR_RULES);
});

test('build-rules --existing 只写入当前目录已存在的项目指令文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-existing-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  const agentsMd = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(claudeMd, '# Claude\n');
  fs.writeFileSync(agentsMd, '# Agents\n');
  runBuildRules(['--existing', dir], ROOT_FOR_RULES);
  assert.ok(fs.readFileSync(claudeMd, 'utf8').includes(RULES_BEGIN));
  assert.ok(fs.readFileSync(agentsMd, 'utf8').includes(RULES_BEGIN));
  runBuildRules(['--check', '--existing', dir], ROOT_FOR_RULES);
});

test('CLAUDE.md 指针受管区本身不含陷阱词（避免自我误报）', () => {
  const { claudeMd } = genInTmp();
  const text = fs.readFileSync(claudeMd, 'utf8');
  const region = text.match(/<!-- STL:RULES:BEGIN -->[\s\S]*?<!-- STL:RULES:END -->/)[0];
  const lex = contentScanner.scan(region);
  const struct = structuralAnalyzer.analyze(region, lex);
  assert.strictEqual(lex.length, 0, `指针含词典陷阱词: ${JSON.stringify(lex)}`);
  assert.strictEqual(struct.length, 0, `指针含结构风险: ${JSON.stringify(struct)}`);
});

test('semantic-rules.md 条目数与词典对数对齐', () => {
  const { rulesFile } = genInTmp();
  const text = fs.readFileSync(rulesFile, 'utf8');
  const lex = require(path.join(ROOT_FOR_RULES, 'lib', 'lexicon-data'));
  const expected = lex.zhPairs.length + lex.enPairs.length;
  const rowCount = (text.match(/^\| [TE]\d+ \|/gm) || []).length;
  assert.strictEqual(rowCount, expected);
});

test('semantic-rules.md 不被当作指令文件（hook 不会扫它）', () => {
  const fileDetector = require(path.join(ROOT_FOR_RULES, 'lib', 'file-detector'));
  assert.ok(!fileDetector.isInstructionFile(path.join(ROOT_FOR_RULES, 'semantic-rules.md')));
});

test('build-rules 幂等：二次运行两份均不变', () => {
  const { claudeMd, rulesFile } = genInTmp();
  const c1 = fs.readFileSync(claudeMd, 'utf8');
  const r1 = fs.readFileSync(rulesFile, 'utf8');
  runBuildRules([claudeMd], ROOT_FOR_RULES);
  assert.strictEqual(fs.readFileSync(claudeMd, 'utf8'), c1);
  assert.strictEqual(fs.readFileSync(rulesFile, 'utf8'), r1);
});

test('build-rules 保留 CLAUDE.md 受管区外的已有内容', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rules-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  fs.writeFileSync(claudeMd, '# 我的项目\n\n保留这段说明。\n');
  runBuildRules([claudeMd], ROOT_FOR_RULES);
  const text = fs.readFileSync(claudeMd, 'utf8');
  assert.ok(text.includes('保留这段说明。'));
  assert.ok(text.includes(RULES_BEGIN));
});

test('build-rules --check：一致=0，篡改 CLAUDE.md 指针=非0', () => {
  const { claudeMd } = genInTmp();
  runBuildRules(['--check', claudeMd], ROOT_FOR_RULES);
  const tampered = fs.readFileSync(claudeMd, 'utf8').replace('semantic-rules.md', 'XXX.md');
  fs.writeFileSync(claudeMd, tampered);
  assert.throws(() => runBuildRules(['--check', claudeMd], ROOT_FOR_RULES));
});

test('build-rules --check：规则文件缺失=非0', () => {
  const { claudeMd, rulesFile } = genInTmp();
  fs.unlinkSync(rulesFile);
  assert.throws(() => runBuildRules(['--check', claudeMd], ROOT_FOR_RULES));
});

test('build-rules --check：CLAUDE.md 缺少受管区=非0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rules-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  fs.writeFileSync(claudeMd, '# 没有受管区的文件\n');
  assert.throws(() => runBuildRules(['--check', claudeMd], ROOT_FOR_RULES));
});

test('项目根 CLAUDE.md 与 semantic-rules.md 均与词典保持同步', () => {
  // 仓库自身产物应已生成且与当前词典一致（防止提交时遗漏重新生成）
  runBuildRules(['--check', path.join(ROOT_FOR_RULES, 'CLAUDE.md')], ROOT_FOR_RULES);
});

test('项目根 AGENTS.md 与 semantic-rules.md 均与词典保持同步', () => {
  runBuildRules(['--check', path.join(ROOT_FOR_RULES, 'AGENTS.md')], ROOT_FOR_RULES);
});

// ========== Metadata Validation Tests ==========
console.log('\n--- Metadata Validation ---');

test('Claude plugin.json is valid JSON with required fields', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.ok(json.name);
  assert.ok(json.version);
  assert.ok(json.description);
  assert.ok(Array.isArray(json.keywords));
});

test('Codex plugin.json is valid JSON with required fields', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.codex-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.strictEqual(json.name, 'semantic-linter');
  assert.strictEqual(json.skills, './skills/');
  assert.ok(json.interface);
  assert.ok(json.interface.displayName);
  assert.ok(Array.isArray(json.interface.defaultPrompt));
  assert.ok(!Object.prototype.hasOwnProperty.call(json, 'hooks'));
  assert.ok(!Object.prototype.hasOwnProperty.call(json, 'commands'));
});

test('Codex marketplace entry points at repo plugin root', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.agents', 'plugins', 'marketplace.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.strictEqual(json.name, 'summersec-semantic-linter');
  assert.ok(Array.isArray(json.plugins));
  const entry = json.plugins.find((p) => p.name === 'semantic-linter');
  assert.ok(entry);
  assert.strictEqual(entry.source.source, 'local');
  assert.strictEqual(entry.source.path, '.');
  assert.strictEqual(entry.policy.installation, 'AVAILABLE');
  assert.strictEqual(entry.policy.authentication, 'ON_INSTALL');
  assert.strictEqual(entry.category, 'Developer Tools');
});

test('rules-installer skill 存在且含 frontmatter', () => {
  const skillPath = path.join(__dirname, '..', 'skills', 'rules-installer', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'skills/rules-installer/SKILL.md 不存在');
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /^---[\s\S]*?name:\s*rules-installer[\s\S]*?description:[\s\S]*?---/);
  // 引导跑脚本而非手写规则
  assert.ok(text.includes('build-rules.js'));
});

test('plugin.json 声明 commands 目录', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.strictEqual(json.commands, './commands/');
});

test('三个 slash 命令存在且含 description frontmatter', () => {
  const cmdDir = path.join(__dirname, '..', 'commands');
  for (const name of ['stl-init', 'stl-rules', 'stl-lexicon']) {
    const p = path.join(cmdDir, `${name}.md`);
    assert.ok(fs.existsSync(p), `commands/${name}.md 不存在`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /^---[\s\S]*?description:[\s\S]*?---/, `${name}.md 缺少 description frontmatter`);
  }
});

test('命令文件本身不含语义陷阱词（避免自我误报）', () => {
  const cmdDir = path.join(__dirname, '..', 'commands');
  for (const name of ['stl-init', 'stl-rules', 'stl-lexicon']) {
    const text = fs.readFileSync(path.join(cmdDir, `${name}.md`), 'utf8');
    const lex = contentScanner.scan(text);
    assert.strictEqual(lex.length, 0, `${name}.md 含陷阱词: ${JSON.stringify(lex)}`);
  }
});

// ========== Cleanup & Summary ==========
try {
  fs.rmSync(tmpDir, { recursive: true });
} catch {
  // cleanup best-effort
}
delete process.env.SEMANTIC_LINTER_STATE_DIR;

console.log(`\n===== New Features: ${getPassed()} passed, ${getFailed()} failed =====`);
exitOnFailure();
