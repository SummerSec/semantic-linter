const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function summary(label = '结果') {
  console.log(`\n--- ${label}：${passed} 个通过, ${failed} 个失败 ---\n`);
}

function exitOnFailure() {
  if (failed > 0) process.exit(1);
}

module.exports = { test, summary, exitOnFailure, assert, getPassed: () => passed, getFailed: () => failed };