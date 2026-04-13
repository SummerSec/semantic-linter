#!/usr/bin/env node
/**
 * Tests for new features: state-manager, SessionStart hook,
 * UserPromptSubmit hook, escalation, plugin.json, benchmarks
 *
 * Uses Node.js built-in assert (zero dependencies)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

const { buildContext } = require(path.join(__dirname, '..', 'hooks', 'session-start'));

test('buildContext with null stats returns default trap words', () => {
  const ctx = buildContext(null, null);
  assert.ok(ctx.includes('Semantic-linter is active'));
  assert.ok(ctx.includes('风险'));
  assert.ok(ctx.includes('Risk'));
});

test('buildContext with session stats includes detection count', () => {
  const stats = { detectionCount: 5, escalationLevel: 2 };
  const ctx = buildContext(stats, null);
  assert.ok(ctx.includes('5 detections'));
  assert.ok(ctx.includes('L2'));
});

test('buildContext with top traps uses dynamic trap IDs', () => {
  const traps = [{ trapId: 'T01', count: 10 }, { trapId: 'T04', count: 5 }];
  const ctx = buildContext(null, traps);
  assert.ok(ctx.includes('T01'));
  assert.ok(ctx.includes('T04'));
});

test('buildContext mentions Pre/PostToolUse hooks', () => {
  const ctx = buildContext(null, null);
  assert.ok(ctx.includes('PreToolUse'));
  assert.ok(ctx.includes('PostToolUse'));
});

test('buildContext output is under 500 characters with defaults', () => {
  const ctx = buildContext(null, null);
  assert.ok(ctx.length < 500, `Context too long: ${ctx.length} chars`);
});

test('buildContext with empty session stats omits session line', () => {
  const stats = { detectionCount: 0, escalationLevel: 0 };
  const ctx = buildContext(stats, null);
  assert.ok(!ctx.includes('Session:'));
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
  assert.ok(warning.includes('"风险"'));
  assert.ok(warning.includes('"审查"'));
  assert.ok(warning.includes('漏洞'));
  assert.ok(warning.includes('检查'));
  assert.ok(warning.includes('2 wide-boundary'));
});

test('formatPromptWarning generates single-paragraph output', () => {
  const matches = [{ word: 'risk', replacement: 'Vulnerability', trapId: 'E01' }];
  const warning = reportFormatter.formatPromptWarning(matches);
  // Should not contain markdown headers or table markers
  assert.ok(!warning.includes('###'));
  assert.ok(!warning.includes('|'));
  assert.ok(warning.includes('Semantic-linter'));
});

test('formatPromptWarning mentions scope issue', () => {
  const matches = [{ word: 'analyze', replacement: 'Summarize', trapId: 'E05' }];
  const warning = reportFormatter.formatPromptWarning(matches);
  assert.ok(warning.includes('exceed intended scope'));
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
  assert.ok(esc.suffix.includes('multiple times'));
});

test('buildEscalation returns REPEATED prefix for L2', () => {
  const esc = reportFormatter.buildEscalation(2, { T01: { count: 3, files: ['/a.md'] } });
  assert.strictEqual(esc.prefix, 'REPEATED ');
  assert.ok(esc.suffix.includes('3+ times'));
});

test('buildEscalation returns PERSISTENT prefix for L3', () => {
  const traps = {
    T01: { count: 3, files: ['/a.md', '/b.md'] },
    T02: { count: 2, files: ['/c.md'] },
  };
  const esc = reportFormatter.buildEscalation(3, traps);
  assert.strictEqual(esc.prefix, 'PERSISTENT ');
  assert.ok(esc.suffix.includes('CLAUDE.md'));
});

test('buildEscalation L3 shows correct file count', () => {
  const traps = {
    T01: { count: 2, files: ['/a.md', '/b.md', '/c.md'] },
  };
  const esc = reportFormatter.buildEscalation(3, traps);
  assert.ok(esc.suffix.includes('3 files'));
});

test('buildEscalation with null returns empty for L0', () => {
  const esc = reportFormatter.buildEscalation(null, null);
  assert.strictEqual(esc.prefix, '');
  assert.strictEqual(esc.suffix, '');
});

// ========== Metadata Validation Tests ==========
console.log('\n--- Metadata Validation ---');

test('plugin.json is valid JSON with required fields', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.ok(json.name);
  assert.ok(json.version);
  assert.ok(json.description);
  assert.ok(Array.isArray(json.keywords));
});

test('expected.json is valid JSON with files object', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'evals', 'expected.json'), 'utf8');
  const json = JSON.parse(raw);
  assert.ok(json.files);
  assert.ok(Object.keys(json.files).length > 0);
});

test('benchmark corpus files all exist', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'evals', 'expected.json'), 'utf8');
  const expected = JSON.parse(raw);
  const corpusDir = path.join(__dirname, '..', 'evals', 'corpus');
  for (const fileName of Object.keys(expected.files)) {
    assert.ok(fs.existsSync(path.join(corpusDir, fileName)), `Missing: ${fileName}`);
  }
});

// ========== Cleanup & Summary ==========
try {
  fs.rmSync(tmpDir, { recursive: true });
} catch {
  // cleanup best-effort
}
delete process.env.SEMANTIC_LINTER_STATE_DIR;

console.log(`\n===== New Features: ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
