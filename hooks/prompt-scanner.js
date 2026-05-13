#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Scan user prompts for semantic trap words
 *
 * Event: UserPromptSubmit (matcher: *)
 * Scans the user's message text for trap words using the existing
 * content-scanner. If found, injects a concise warning via systemMessage.
 */

const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const { readStdin, outputJson, recordDetection } = require(path.join(libDir, 'hook-utils'));
const contentScanner = require(path.join(libDir, 'content-scanner'));
const reportFormatter = require(path.join(libDir, 'report-formatter'));
const configLoader = require(path.join(libDir, 'config-loader'));

const input = readStdin();
const userMessage = input.user_prompt || '';

if (!userMessage.trim()) outputJson({});

try {
  const cfg = configLoader.loadConfigForWorkspace();
  let matches = contentScanner.scan(userMessage);
  matches = configLoader.applyConfig(matches, [], cfg).lexiconMatches;

  if (matches.length === 0) outputJson({});

  for (const m of matches) {
    recordDetection(libDir, m.trapId, m.word, '__user_prompt__');
  }

  const warning = reportFormatter.formatPromptWarning(matches);
  outputJson({ continue: true, systemMessage: warning });
} catch {
  outputJson({});
}