#!/usr/bin/env node
/**
 * Tests for new runtime architecture: state manager, session/subagent hooks,
 * config loading, build-rules generation, and metadata alignment.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { test, exitOnFailure, getPassed, getFailed, assert } = require('./helpers');

function runNode(scriptPath, args = [], options = {}) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function runJsonHook(scriptPath, payload, options = {}) {
  const stdout = runNode(scriptPath, [], {
    input: JSON.stringify(payload),
    ...options,
  });
  return JSON.parse(stdout);
}

console.log('\n--- State Manager (state-manager) ---');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-linter-test-'));
process.env.SEMANTIC_LINTER_STATE_DIR = tmpDir;

delete require.cache[require.resolve(path.join(__dirname, '..', 'lib', 'state-manager'))];
const stateManager = require(path.join(__dirname, '..', 'lib', 'state-manager'));

test('initState creates directory and files', () => {
  stateManager.initState();
  assert.ok(fs.existsSync(tmpDir));
  assert.ok(fs.existsSync(path.join(tmpDir, 'stats.json')));
  assert.ok(fs.existsSync(path.join(tmpDir, 'session.json')));
});

test('recordDetection increments trap frequency and session count', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/tmp/a.md');
  const session = stateManager.getSessionStats();
  const stats = JSON.parse(fs.readFileSync(path.join(tmpDir, 'stats.json'), 'utf8'));
  assert.ok(session.detectionCount >= 1);
  assert.ok(stats.trapFrequency.T01.count >= 1);
});

test('computeEscalationLevel reaches L3 across multiple files', () => {
  stateManager.resetSession();
  stateManager.recordDetection('T01', '风险', '/a.md');
  stateManager.recordDetection('T02', '审查', '/b.md');
  stateManager.recordDetection('T04', '问题', '/c.md');
  stateManager.recordDetection('T05', '分析', '/d.md');
  stateManager.recordDetection('T08', '改善', '/e.md');
  assert.strictEqual(stateManager.computeEscalationLevel(), 3);
});

console.log('\n--- Session / Subagent Hooks ---');

const sessionStart = require(path.join(__dirname, '..', 'hooks', 'session-start'));
const subagentStartPath = path.join(__dirname, '..', 'hooks', 'subagent-start.js');
const sessionStartPath = path.join(__dirname, '..', 'hooks', 'session-start.js');
const promptHookPath = path.join(__dirname, '..', 'hooks', 'user-prompt-submit.js');
const preToolHookPath = path.join(__dirname, '..', 'hooks', 'pre-tool-use.js');
const postToolHookPath = path.join(__dirname, '..', 'hooks', 'post-tool-use.js');
const runtime = require(path.join(__dirname, '..', 'hooks', 'runtime'));
const rulesResolver = require(path.join(__dirname, '..', 'hooks', 'rules-resolver'));

test('buildContext mentions mode and semantic-rules path', () => {
  const ctx = sessionStart.buildContext('/x/semantic-rules.md', { mode: 'guarded', source: 'project' });
  assert.ok(ctx.startsWith('STL：'));
  assert.ok(ctx.includes('guarded'));
  assert.ok(ctx.includes('/x/semantic-rules.md'));
});

test('buildContext fallback branch works without rules file', () => {
  const ctx = sessionStart.buildContext(null, { mode: 'pointer', source: 'none' });
  assert.ok(ctx.includes('pointer'));
  assert.ok(ctx.includes('No semantic-rules.md file was found'));
});

test('session-start context stays compact', () => {
  const ctx = sessionStart.buildContext('/x/semantic-rules.md', { mode: 'guarded', source: 'project' });
  assert.ok(ctx.length < 500, `Context too long: ${ctx.length}`);
});

test('runtime prefers explicit plugin env vars for plugin root and data dir', () => {
  const prevRoot = process.env.PLUGIN_ROOT;
  const prevData = process.env.PLUGIN_DATA;
  process.env.PLUGIN_ROOT = '/plugin-root';
  process.env.PLUGIN_DATA = '/plugin-data';
  assert.strictEqual(runtime.getPluginRoot(), '/plugin-root');
  assert.strictEqual(runtime.getPluginDataDir(), '/plugin-data');
  process.env.PLUGIN_ROOT = prevRoot;
  process.env.PLUGIN_DATA = prevData;
});

test('rules-resolver finds nearest project semantic-rules.md first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rules-resolve-'));
  const nested = path.join(dir, 'skills', 'demo');
  fs.mkdirSync(nested, { recursive: true });
  const localRules = path.join(dir, 'semantic-rules.md');
  fs.writeFileSync(localRules, '# local rules\n');
  const resolved = rulesResolver.resolveRulesPath({ cwd: nested, ruleSource: 'project-first' });
  assert.strictEqual(resolved.path, localRules);
  assert.strictEqual(resolved.source, 'project');
});

test('subagent-start script exists for context propagation', () => {
  assert.ok(fs.existsSync(subagentStartPath));
});

test('session-start script emits hookSpecificOutput with project rules path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-session-start-'));
  const rulesPath = path.join(dir, 'semantic-rules.md');
  fs.writeFileSync(rulesPath, '# local rules\n');
  const output = JSON.parse(runNode(sessionStartPath, [], { cwd: dir }));
  assert.strictEqual(output.continue, true);
  assert.strictEqual(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(output.hookSpecificOutput.additionalContext.includes(rulesPath));
});

test('subagent-start script emits hookSpecificOutput with project rules path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-subagent-start-'));
  const rulesPath = path.join(dir, 'semantic-rules.md');
  fs.writeFileSync(rulesPath, '# local rules\n');
  const output = JSON.parse(runNode(subagentStartPath, [], { cwd: dir }));
  assert.strictEqual(output.continue, true);
  assert.strictEqual(output.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.ok(output.hookSpecificOutput.additionalContext.includes(rulesPath));
});

console.log('\n--- Hook Entrypoints ---');

test('user-prompt-submit stores mode command and acknowledges switch', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-hook-mode-'));
  const output = runJsonHook(promptHookPath, { user_message: '/stl-mode strict' }, {
    env: { ...process.env, PLUGIN_DATA: dataDir },
  });
  assert.strictEqual(output.continue, true);
  assert.ok(output.systemMessage.includes('strict'));
  assert.strictEqual(
    fs.readFileSync(path.join(dataDir, '.semantic-linter-mode'), 'utf8').trim(),
    'strict',
  );
});

test('user-prompt-submit warns in strict mode for wide-boundary wording', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-hook-prompt-'));
  fs.writeFileSync(path.join(dataDir, '.semantic-linter-mode'), 'strict', 'utf8');
  const output = runJsonHook(promptHookPath, { user_message: 'Please analyze the risk here.' }, {
    env: { ...process.env, PLUGIN_DATA: dataDir },
  });
  assert.strictEqual(output.continue, true);
  assert.ok(output.systemMessage.includes('STL'));
  assert.ok(output.systemMessage.includes('risk'));
});

test('pre-tool-use warns before writing an instruction file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-pre-tool-'));
  const filePath = path.join(dir, 'skills', 'demo', 'SKILL.md');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const output = runJsonHook(preToolHookPath, {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: 'Please analyze the risk in this instruction.',
    },
  });
  assert.strictEqual(output.continue, true);
  assert.ok(output.systemMessage.includes('STL'));
  assert.ok(output.systemMessage.includes('risk'));
});

test('pre-tool-use ignores non-instruction files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-pre-ignore-'));
  const filePath = path.join(dir, 'notes.md');
  const output = runJsonHook(preToolHookPath, {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: 'Please analyze the risk in this note.',
    },
  });
  assert.strictEqual(output.continue, true);
  assert.ok(!output.systemMessage);
});

test('post-tool-use warns after writing and records detection state', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-post-tool-state-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-post-tool-'));
  const filePath = path.join(dir, 'AGENTS.md');
  const output = runJsonHook(postToolHookPath, {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: 'Please review the risk handling in this agent instruction.',
    },
  }, {
    env: { ...process.env, SEMANTIC_LINTER_STATE_DIR: dataDir },
  });
  assert.strictEqual(output.continue, true);
  assert.ok(output.systemMessage.includes('STL'));
  const session = JSON.parse(fs.readFileSync(path.join(dataDir, 'session.json'), 'utf8'));
  assert.ok(session.detectionCount >= 1);
  assert.ok(Object.keys(session.trapOccurrences).length >= 1);
});

console.log('\n--- Prompt Warning / Escalation Formatting ---');

const reportFormatter = require(path.join(__dirname, '..', 'lib', 'report-formatter'));

test('formatPromptWarning returns empty for no matches', () => {
  assert.strictEqual(reportFormatter.formatPromptWarning([]), '');
});

test('formatPromptWarning contains replacement guidance', () => {
  const warning = reportFormatter.formatPromptWarning([
    { word: 'risk', replacement: 'Vulnerability', trapId: 'E01' },
  ]);
  assert.ok(warning.includes('STL'));
  assert.ok(warning.includes('Vulnerability'));
});

test('buildEscalation returns suffix for L2', () => {
  const esc = reportFormatter.buildEscalation(2, { T01: { count: 3, files: ['/a.md'] } });
  assert.ok(esc.suffix.includes('3'));
});

console.log('\n--- Config / meta / build-lexicon ---');

test('package.json and plugin manifests stay version-aligned', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const claudePlug = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
  const codexPlug = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.codex-plugin', 'plugin.json'), 'utf8'));
  const claudeMarket = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(pkg.version, claudePlug.version);
  assert.strictEqual(pkg.version, codexPlug.version);
  assert.strictEqual(pkg.version, claudeMarket.plugins[0].version);
});

test('config-loader parses new runtime fields', () => {
  const configLoader = require(path.join(__dirname, '..', 'lib', 'config-loader'));
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cfg-'));
  fs.mkdirSync(path.join(cfgDir, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(cfgDir, '.semantic-linter.json'), JSON.stringify({
    ignoreTrapIds: ['T01'],
    ignoreStructuralTypes: ['open_ended_verb'],
    defaultMode: 'strict',
    ruleSource: 'plugin-only',
    enablePromptScan: true,
    maxFindingsPerHook: 5,
  }));
  const cfg = configLoader.loadConfigForFile(path.join(cfgDir, 'skills', 'a.md'));
  assert.ok(cfg.ignoreTrapIds.has('T01'));
  assert.ok(cfg.ignoreStructuralTypes.has('open_ended_verb'));
  assert.strictEqual(cfg.defaultMode, 'strict');
  assert.strictEqual(cfg.ruleSource, 'plugin-only');
  assert.strictEqual(cfg.enablePromptScan, true);
  assert.strictEqual(cfg.maxFindingsPerHook, 5);
});

test('build-lexicon --check passes', () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build-lexicon.js'), '--check'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
});

console.log('\n--- build-rules ---');

const ROOT_FOR_RULES = path.join(__dirname, '..');
const BUILD_RULES = path.join(ROOT_FOR_RULES, 'scripts', 'build-rules.js');
const RULES_BEGIN = '<!-- STL:RULES:BEGIN -->';
const RULES_END = '<!-- STL:RULES:END -->';

function runBuildRules(args, cwd, env = {}) {
  return execFileSync('node', [BUILD_RULES, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
  });
}

function genInTmp(targetName = 'CLAUDE.md') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rules-'));
  const target = path.join(dir, targetName);
  runBuildRules([target], ROOT_FOR_RULES);
  return { dir, target, rulesFile: path.join(dir, 'semantic-rules.md') };
}

test('build-rules generates pointer block and semantic-rules.md', () => {
  const { target, rulesFile } = genInTmp();
  const pointer = fs.readFileSync(target, 'utf8');
  assert.ok(pointer.includes(RULES_BEGIN) && pointer.includes(RULES_END));
  assert.ok(pointer.includes('semantic-rules.md'));
  const rules = fs.readFileSync(rulesFile, 'utf8');
  assert.ok(rules.includes('Four checks'));
  assert.ok(rules.includes('Known trap pairs'));
});

test('build-rules writes AGENTS.md too', () => {
  const { target, rulesFile } = genInTmp('AGENTS.md');
  const pointer = fs.readFileSync(target, 'utf8');
  assert.ok(pointer.includes(RULES_BEGIN));
  assert.ok(fs.existsSync(rulesFile));
});

test('build-rules --existing updates both existing project instruction files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-existing-'));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  const agentsMd = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(claudeMd, '# Claude\n');
  fs.writeFileSync(agentsMd, '# Agents\n');
  runBuildRules(['--existing', dir], ROOT_FOR_RULES);
  assert.ok(fs.readFileSync(claudeMd, 'utf8').includes(RULES_BEGIN));
  assert.ok(fs.readFileSync(agentsMd, 'utf8').includes(RULES_BEGIN));
});

test('build-rules defaults to AGENTS.md for codex host', () => {
  const output = runBuildRules(['--host', 'codex'], ROOT_FOR_RULES);
  assert.ok(output.includes('AGENTS.md'));
});

test('managed pointer block avoids trap-word findings', () => {
  const { target } = genInTmp();
  const text = fs.readFileSync(target, 'utf8');
  const region = text.match(/<!-- STL:RULES:BEGIN -->[\s\S]*?<!-- STL:RULES:END -->/)[0];
  const contentScanner = require(path.join(ROOT_FOR_RULES, 'lib', 'content-scanner'));
  const structuralAnalyzer = require(path.join(ROOT_FOR_RULES, 'lib', 'structural-analyzer'));
  const lex = contentScanner.scan(region);
  const struct = structuralAnalyzer.analyze(region, lex);
  assert.strictEqual(lex.length, 0);
  assert.strictEqual(struct.length, 0);
});

test('semantic-rules.md entry count matches lexicon pair count', () => {
  const { rulesFile } = genInTmp();
  const text = fs.readFileSync(rulesFile, 'utf8');
  const lex = require(path.join(ROOT_FOR_RULES, 'lib', 'lexicon-data'));
  const expected = lex.zhPairs.length + lex.enPairs.length;
  const rowCount = (text.match(/^\| [TE]\d+ \|/gm) || []).length;
  assert.strictEqual(rowCount, expected);
});

test('build-rules --check fails when managed region drifts', () => {
  const { target } = genInTmp();
  const tampered = fs.readFileSync(target, 'utf8').replace('semantic-rules.md', 'XXX.md');
  fs.writeFileSync(target, tampered);
  assert.throws(() => runBuildRules(['--check', target], ROOT_FOR_RULES));
});

test('repo CLAUDE.md and AGENTS.md stay in sync with lexicon', () => {
  runBuildRules(['--check', path.join(ROOT_FOR_RULES, 'CLAUDE.md'), path.join(ROOT_FOR_RULES, 'AGENTS.md')], ROOT_FOR_RULES);
});

console.log('\n--- Metadata Validation ---');

test('Claude plugin manifest declares hooks, skills, and commands', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.strictEqual(json.hooks, './hooks/hooks.json');
  assert.strictEqual(json.skills, './skills/');
  assert.strictEqual(json.commands, './commands/');
});

test('Codex plugin manifest keeps skills and interface only', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.codex-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.strictEqual(json.name, 'semantic-linter');
  assert.strictEqual(json.skills, './skills/');
  assert.ok(json.interface);
  assert.ok(!Object.prototype.hasOwnProperty.call(json, 'hooks'));
});

test('Codex marketplace entry points at repo plugin root', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.agents', 'plugins', 'marketplace.json'), 'utf8');
  const json = JSON.parse(raw);
  const entry = json.plugins.find((p) => p.name === 'semantic-linter');
  assert.ok(entry);
  assert.strictEqual(entry.source.source, 'local');
  assert.strictEqual(entry.source.path, '.');
});

test('rules-installer skill exists and references build-rules.js', () => {
  const skillPath = path.join(__dirname, '..', 'skills', 'rules-installer', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath));
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.ok(text.includes('build-rules.js'));
});

try {
  fs.rmSync(tmpDir, { recursive: true });
} catch {
  // cleanup best effort
}
delete process.env.SEMANTIC_LINTER_STATE_DIR;

console.log(`\n===== New Features: ${getPassed()} passed, ${getFailed()} failed =====`);
exitOnFailure();
