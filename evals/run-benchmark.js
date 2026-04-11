#!/usr/bin/env node
/**
 * Benchmark runner for semantic-linter
 * Scans corpus files, compares against expected annotations,
 * and reports precision, recall, and accuracy metrics.
 */

const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'plugin', 'lib');
const contentScanner = require(path.join(libDir, 'content-scanner'));
const structuralAnalyzer = require(path.join(libDir, 'structural-analyzer'));

const CORPUS_DIR = path.join(__dirname, 'corpus');
const EXPECTED_FILE = path.join(__dirname, 'expected.json');

const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function loadExpected() {
  const raw = fs.readFileSync(EXPECTED_FILE, 'utf8');
  return JSON.parse(raw);
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lexiconMatches = contentScanner.scan(content);
  const structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  return { lexiconMatches, structuralRisks };
}

function compareFile(fileName, actual, expected) {
  const results = { fileName, passed: true, details: [] };

  // Compare lexicon count
  if (actual.lexiconMatches.length !== expected.expectedLexiconCount) {
    results.passed = false;
    results.details.push(
      `Lexicon count: expected ${expected.expectedLexiconCount}, got ${actual.lexiconMatches.length}`
    );
  }

  // Compare structural count
  if (actual.structuralRisks.length !== expected.expectedStructuralCount) {
    results.passed = false;
    results.details.push(
      `Structural count: expected ${expected.expectedStructuralCount}, got ${actual.structuralRisks.length}`
    );
  }

  // Compare trap IDs (as sets)
  const actualTrapIds = actual.lexiconMatches.map(m => m.trapId);
  const expectedTrapIds = expected.expectedTrapIds || [];
  const actualSet = new Set(actualTrapIds);
  const expectedSet = new Set(expectedTrapIds);

  const falsePositives = [...actualSet].filter(id => !expectedSet.has(id));
  const falseNegatives = [...expectedSet].filter(id => !actualSet.has(id));

  if (falsePositives.length > 0) {
    results.passed = false;
    results.details.push(`False positives: ${falsePositives.join(', ')}`);
  }
  if (falseNegatives.length > 0) {
    results.passed = false;
    results.details.push(`False negatives: ${falseNegatives.join(', ')}`);
  }

  // Compare structural types (as sets)
  const actualTypes = new Set(actual.structuralRisks.map(r => r.type));
  const expectedTypes = new Set(expected.expectedStructuralTypes || []);
  const missingTypes = [...expectedTypes].filter(t => !actualTypes.has(t));
  const extraTypes = [...actualTypes].filter(t => !expectedTypes.has(t));

  if (missingTypes.length > 0) {
    results.details.push(`Missing structural types: ${missingTypes.join(', ')}`);
  }
  if (extraTypes.length > 0) {
    results.details.push(`Extra structural types: ${extraTypes.join(', ')}`);
  }

  return results;
}

function computeMetrics(allResults, expectedData) {
  let totalExpectedTraps = 0;
  let totalActualTraps = 0;
  let truePositives = 0;

  for (const r of allResults) {
    const expected = expectedData.files[r.fileName];
    const expectedIds = new Set(expected.expectedTrapIds || []);
    const actualIds = new Set(r.actualTrapIds || []);

    totalExpectedTraps += expectedIds.size;
    totalActualTraps += actualIds.size;

    for (const id of actualIds) {
      if (expectedIds.has(id)) truePositives++;
    }
  }

  const falsePositives = totalActualTraps - truePositives;
  const falseNegatives = totalExpectedTraps - truePositives;

  const precision = totalActualTraps > 0 ? truePositives / totalActualTraps : 1;
  const recall = totalExpectedTraps > 0 ? truePositives / totalExpectedTraps : 1;

  return { truePositives, falsePositives, falseNegatives, precision, recall };
}

function run() {
  const expected = loadExpected();
  const fileNames = Object.keys(expected.files);

  console.log(`${ANSI.bold}semantic-linter benchmark v1.0.0${ANSI.reset}\n`);

  const allResults = [];
  let passCount = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(CORPUS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`${ANSI.red}MISSING${ANSI.reset}  ${fileName}`);
      continue;
    }

    const actual = scanFile(filePath);
    const result = compareFile(fileName, actual, expected.files[fileName]);
    result.actualTrapIds = actual.lexiconMatches.map(m => m.trapId);

    allResults.push(result);

    const status = result.passed
      ? `${ANSI.green}PASS${ANSI.reset}`
      : `${ANSI.red}FAIL${ANSI.reset}`;

    console.log(`${status}  ${fileName}`);
    console.log(`${ANSI.dim}  Expected: ${expected.files[fileName].expectedLexiconCount} lexicon, ${expected.files[fileName].expectedStructuralCount} structural${ANSI.reset}`);
    console.log(`${ANSI.dim}  Actual:   ${actual.lexiconMatches.length} lexicon, ${actual.structuralRisks.length} structural${ANSI.reset}`);

    if (result.details.length > 0) {
      for (const d of result.details) {
        console.log(`  ${ANSI.yellow}${d}${ANSI.reset}`);
      }
    }

    if (result.passed) passCount++;
    console.log('');
  }

  // Metrics
  const metrics = computeMetrics(allResults, expected);

  console.log(`${ANSI.bold}--- Metrics ---${ANSI.reset}`);
  console.log(`Precision: ${(metrics.precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(metrics.recall * 100).toFixed(1)}%`);
  console.log(`TP: ${metrics.truePositives}  FP: ${metrics.falsePositives}  FN: ${metrics.falseNegatives}`);
  console.log(`Files: ${passCount}/${allResults.length} passed`);

  // Exit code
  process.exit(passCount === allResults.length ? 0 : 1);
}

run();
