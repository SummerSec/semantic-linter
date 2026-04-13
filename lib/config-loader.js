/**
 * 加载项目级 .semantic-linter.json（自文件所在目录向上查找）
 *
 * @module config-loader
 */

const fs = require('fs');
const path = require('path');

const CONFIG_NAME = '.semantic-linter.json';

/**
 * @returns {{ ignoreTrapIds: Set<string>, ignorePathSubstrings: string[], ignoreStructuralTypes: Set<string> }}
 */
function emptyConfig() {
  return {
    ignoreTrapIds: new Set(),
    ignorePathSubstrings: [],
    ignoreStructuralTypes: new Set(),
  };
}

/**
 * @param {string} dir - 起始目录（通常为文件所在目录）
 * @returns {object|null}
 */
function findConfigFile(dir) {
  let current = path.resolve(dir);
  for (;;) {
    const candidate = path.join(current, CONFIG_NAME);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * @param {string} configPath
 * @returns {ReturnType<typeof emptyConfig>}
 */
function parseConfigFile(configPath) {
  const out = emptyConfig();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object') return out;

  if (Array.isArray(raw.ignoreTrapIds)) {
    for (const id of raw.ignoreTrapIds) {
      if (typeof id === 'string' && id.trim()) out.ignoreTrapIds.add(id.trim());
    }
  }
  if (Array.isArray(raw.ignorePathSubstrings)) {
    out.ignorePathSubstrings = raw.ignorePathSubstrings.filter((s) => typeof s === 'string' && s.length > 0);
  }
  if (Array.isArray(raw.ignoreStructuralTypes)) {
    for (const t of raw.ignoreStructuralTypes) {
      if (typeof t === 'string' && t.trim()) out.ignoreStructuralTypes.add(t.trim());
    }
  }

  return out;
}

/**
 * @param {string} absoluteFilePath - 被扫描文件的绝对路径
 */
function loadConfigForFile(absoluteFilePath) {
  const dir = path.dirname(path.resolve(absoluteFilePath));
  const found = findConfigFile(dir);
  if (!found) return emptyConfig();
  return parseConfigFile(found);
}

/**
 * 无具体文件路径时（如用户消息扫描），从工作区目录向上查找配置
 * @param {string} [cwd]
 */
function loadConfigForWorkspace(cwd = process.cwd()) {
  const found = findConfigFile(path.resolve(cwd));
  if (!found) return emptyConfig();
  return parseConfigFile(found);
}

/**
 * @param {string} absoluteFilePath
 * @param {ReturnType<typeof emptyConfig>} config
 */
function shouldIgnoreFile(absoluteFilePath, config) {
  if (!config.ignorePathSubstrings.length) return false;
  const norm = absoluteFilePath.replace(/\\/g, '/');
  return config.ignorePathSubstrings.some((sub) => norm.includes(sub.replace(/\\/g, '/')));
}

/**
 * @param {Array<Object>} lexiconMatches
 * @param {Array<Object>} structuralRisks
 * @param {ReturnType<typeof emptyConfig>} config
 */
function applyConfig(lexiconMatches, structuralRisks, config) {
  let lex = lexiconMatches;
  let struct = structuralRisks;

  if (config.ignoreTrapIds.size > 0) {
    lex = lex.filter((m) => !config.ignoreTrapIds.has(m.trapId));
  }
  if (config.ignoreStructuralTypes.size > 0) {
    struct = struct.filter((r) => !config.ignoreStructuralTypes.has(r.type));
  }

  return { lexiconMatches: lex, structuralRisks: struct };
}

module.exports = {
  CONFIG_NAME,
  emptyConfig,
  loadConfigForFile,
  loadConfigForWorkspace,
  shouldIgnoreFile,
  applyConfig,
  findConfigFile,
};
