/**
 * Shared scan pipeline — extracted from hook inline logic.
 * Runs: config load → content scan → config filter → structural analysis → config filter.
 *
 * @module scan-pipeline
 */

const path = require('path');
const contentScanner = require('./content-scanner');
const structuralAnalyzer = require('./structural-analyzer');
const configLoader = require('./config-loader');

/**
 * @param {string} content - file text to scan
 * @param {string} filePath - absolute or relative path (used for config lookup)
 * @returns {{ lexiconMatches: Array, structuralRisks: Array, totalFindings: number, ignored?: boolean }}
 */
function runScanPipeline(content, filePath) {
  const absFile = path.resolve(filePath);
  const cfg = configLoader.loadConfigForFile(absFile);

  if (configLoader.shouldIgnoreFile(absFile, cfg)) {
    return { lexiconMatches: [], structuralRisks: [], totalFindings: 0, ignored: true };
  }

  let lexiconMatches = contentScanner.scan(content);
  lexiconMatches = configLoader.applyConfig(lexiconMatches, [], cfg).lexiconMatches;

  let structuralRisks = structuralAnalyzer.analyze(content, lexiconMatches);
  structuralRisks = configLoader.applyConfig([], structuralRisks, cfg).structuralRisks;

  const totalFindings = lexiconMatches.length + structuralRisks.length;

  return { lexiconMatches, structuralRisks, totalFindings };
}

module.exports = { runScanPipeline };
