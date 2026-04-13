#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Scan user prompts for semantic trap words
 *
 * Event: UserPromptSubmit (matcher: *)
 * Scans the user's message text for trap words using the existing
 * content-scanner. If found, injects a concise warning via systemMessage.
 */

const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const contentScanner = require(path.join(libDir, 'content-scanner'));
const reportFormatter = require(path.join(libDir, 'report-formatter'));

// Read stdin
let input = {};
try {
  const stdinData = fs.readFileSync(0, 'utf8');
  if (stdinData.trim()) {
    input = JSON.parse(stdinData);
  }
} catch {
  // Use default empty object
}

try {
  const userMessage = input.prompt || '';

  if (!userMessage.trim()) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Scan user prompt for trap words (skip structural analysis)
  const matches = contentScanner.scan(userMessage);

  if (matches.length === 0) {
    console.log(JSON.stringify({}));
    process.exit(0);
  }

  // Record detections if state-manager is available
  try {
    const stateManager = require(path.join(libDir, 'state-manager'));
    for (const m of matches) {
      stateManager.recordDetection(m.trapId, m.word, '__user_prompt__');
    }
  } catch {
    // state-manager unavailable
  }

  // Format concise warning
  const warning = reportFormatter.formatPromptWarning(matches);

  console.log(JSON.stringify({ continue: true, systemMessage: warning }));
  process.exit(0);
} catch {
  console.log(JSON.stringify({}));
  process.exit(0);
}
