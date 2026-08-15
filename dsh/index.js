const fs = require('fs');
const path = require('path');

const PROVIDER_NAME = 'semantic-linter';
const BUNDLED_SKILL_RANK = 600;
const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true });
const SKILLS_ROOT = path.join(__dirname, '..', 'skills');
const SKILL_DIRECTORIES = Object.freeze(fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SKILLS_ROOT, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort());

function parseSkillFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`DSH skill is missing frontmatter: ${filePath}`);

  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*(.+?)\s*$/m)?.[1];
  const description = frontmatter.match(/^description:\s*(.+?)\s*$/m)?.[1];
  if (!name || !description) {
    throw new Error(`DSH skill frontmatter requires name and description: ${filePath}`);
  }

  return {
    name,
    description,
    content: raw.slice(match[0].length).trimStart(),
  };
}

function createSkillEntry(directoryName) {
  const directory = path.join(SKILLS_ROOT, directoryName);
  const filePath = path.join(directory, 'SKILL.md');
  const parsed = parseSkillFile(filePath);
  const resourceBase = Object.freeze({ kind: 'directory', path: directory });
  const locator = Object.freeze({ filePath, resourceBase });
  const candidate = Object.freeze({
    name: parsed.name,
    description: parsed.description,
    invocation: INVOCATION,
    source: 'bundled',
    provider: PROVIDER_NAME,
    resourceBase,
    rank: BUNDLED_SKILL_RANK,
    locator,
    path: filePath,
  });
  return { candidate, locator };
}

const entries = SKILL_DIRECTORIES.map(createSkillEntry);
const candidates = Object.freeze(entries.map((entry) => entry.candidate));

const provider = Object.freeze({
  name: PROVIDER_NAME,
  list() {
    return Promise.resolve(candidates);
  },
  async get(candidate) {
    const locator = candidate && candidate.locator;
    const entry = entries.find((item) => item.locator === locator);
    if (!entry) return undefined;

    const parsed = parseSkillFile(locator.filePath);
    if (parsed.name !== candidate.name) return undefined;
    return {
      name: candidate.name,
      description: parsed.description,
      invocation: candidate.invocation,
      source: candidate.source,
      provider: candidate.provider,
      resourceBase: candidate.resourceBase,
      content: parsed.content,
      path: candidate.path,
    };
  },
});

exports.name = 'semantic-linter';
exports.inject = ['skills'];
exports.apply = function apply(ctx) {
  ctx.skills.registerProvider(() => provider);
};
