#!/usr/bin/env node
/**
 * Reports how the code style of this repository changed since a checkpoint, so an
 * agent can refresh `SKILL.md` and its references from a small diff instead of
 * reading all of `src/` again.
 *
 * Usage:
 *   node skills/spectra-processing-code-style/scripts/style-delta.mjs
 *   node skills/spectra-processing-code-style/scripts/style-delta.mjs --from <ref>
 *   node skills/spectra-processing-code-style/scripts/style-delta.mjs --from <ref> --to <ref>
 *   node skills/spectra-processing-code-style/scripts/style-delta.mjs --print
 *   node skills/spectra-processing-code-style/scripts/style-delta.mjs --no-checkpoint
 *
 * The checkpoint lives in `references/.checkpoint` (one commit SHA). A successful
 * run writes `references/style-delta.md` and moves the checkpoint to `--to`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const SKILL_DIR = resolve(import.meta.dirname, '..');
const REFERENCES_DIR = join(SKILL_DIR, 'references');
const CHECKPOINT_FILE = join(REFERENCES_DIR, '.checkpoint');
const DEFAULT_OUTPUT = join(REFERENCES_DIR, 'style-delta.md');

const USAGE = [
  'Usage: node skills/spectra-processing-code-style/scripts/style-delta.mjs [options]',
  '',
  'Options:',
  '  --from <rev>     start of the range. Any revision git understands: a tag,',
  '                   a branch, or a commit SHA, full or abbreviated.',
  '                   Defaults to the SHA stored in references/.checkpoint.',
  '  --to <rev>       end of the range. Defaults to HEAD.',
  '  --out <file>     report path. Defaults to references/style-delta.md.',
  '  --print          write the report to stdout instead of the file.',
  '  --no-checkpoint  keep references/.checkpoint unchanged.',
  '  -h, --help       show this help.',
  '',
].join('\n');

const WATCHED_PATHS = [
  'src',
  'benchmark',
  'eslint.config.js',
  '.prettierrc.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'vitest.config.ts',
  'vitest.setup.ts',
  'package.json',
];

const RISK_PATTERNS = [
  {
    pattern: /\.(?:map|filter|forEach|reduce)\(/u,
    note: 'array helper — house style is an indexed for loop on numeric data',
  },
  {
    pattern: /for \(const \w+ of /u,
    note: 'for...of — typed arrays must be walked by index',
  },
  {
    pattern: /: any\b/u,
    note: 'any — prefer unknown plus a guard, or a scoped eslint-disable with a reason',
  },
  {
    pattern: /@ts-ignore/u,
    note: '@ts-ignore — replace with @ts-expect-error and a reason',
  },
  {
    pattern: /eslint-disable(?!.*--)/u,
    note: 'eslint-disable without a `-- reason` suffix',
  },
  {
    pattern: /Math\.random\(/u,
    note: 'unseeded randomness — tests and benchmarks use new XSadd(seed)',
  },
  {
    pattern: /\.at\(-1\)(?! as )/u,
    note: '.at(-1) without an `as number` cast (noUncheckedIndexedAccess is off)',
  },
];

const EXPORT_PATTERN =
  /^export (?:default )?(?:async )?(?:function|const|let|class|interface|type|enum) (?<name>\w+)/u;

/**
 * Reads the command line.
 * @param {string[]} argv - process.argv slice.
 * @returns {{from: string | undefined, to: string, output: string, writeCheckpoint: boolean, print: boolean}} options.
 */
function parseArgs(argv) {
  const options = {
    from: undefined,
    to: 'HEAD',
    output: DEFAULT_OUTPUT,
    writeCheckpoint: true,
    print: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--from': {
        options.from = nextValue(argv, ++i, '--from');
        break;
      }
      case '--to': {
        options.to = nextValue(argv, ++i, '--to');
        break;
      }
      case '--out': {
        options.output = resolve(nextValue(argv, ++i, '--out'));
        break;
      }
      case '--no-checkpoint': {
        options.writeCheckpoint = false;
        break;
      }
      case '--print': {
        options.print = true;
        break;
      }
      case '-h':
      case '--help': {
        options.help = true;
        break;
      }
      default: {
        throw new Error(`unknown argument: ${arg}`);
      }
    }
  }
  return options;
}

/**
 * Reads the value that follows an option.
 * @param {string[]} argv - command line.
 * @param {number} index - position of the value.
 * @param {string} name - option name, for the error message.
 * @returns {string} the value.
 */
function nextValue(argv, index, name) {
  const value = argv[index];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`missing value for ${name}`);
  }
  return value;
}

/**
 * Runs git and returns its standard output.
 * @param {string[]} args - git arguments.
 * @returns {string} output.
 */
function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

/**
 * Resolves a revision to a full SHA.
 * @param {string} ref - revision.
 * @returns {string} full SHA.
 */
function resolveCommit(ref) {
  try {
    return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  } catch (error) {
    throw new Error(
      `unknown revision: ${ref} (expected a tag, a branch or a commit SHA)`,
      { cause: error },
    );
  }
}

/**
 * Reads the recorded checkpoint, if any.
 * @returns {string | undefined} the checkpoint ref.
 */
function readCheckpoint() {
  if (!existsSync(CHECKPOINT_FILE)) return undefined;
  return readFileSync(CHECKPOINT_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Describes a commit for the provenance lines of the report.
 * @param {string} sha - full commit SHA.
 * @returns {{short: string, date: string, subject: string}} description.
 */
function describeCommit(sha) {
  const [short, date, subject] = git([
    'show',
    '-s',
    '--date=short',
    '--format=%h%n%ad%n%s',
    sha,
  ])
    .trimEnd()
    .split('\n');
  return { short, date, subject };
}

/**
 * Lists the commits of a range.
 * @param {string} from - start commit.
 * @param {string} to - end commit.
 * @returns {Array<{sha: string, type: string, subject: string}>} commits.
 */
function getCommits(from, to) {
  const output = git([
    'log',
    '--no-merges',
    '--pretty=%h\t%s',
    `${from}..${to}`,
  ]);
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [sha, subject] = line.split('\t');
      const match = /^(?<type>[a-z]+)(?:\([^)]*\))?!?:/u.exec(subject);
      return { sha, subject, type: match ? match.groups.type : 'other' };
    });
}

/**
 * Lists the watched files that changed in a range.
 * @param {string} from - start commit.
 * @param {string} to - end commit.
 * @returns {Array<{status: string, path: string}>} changed files.
 */
function getChangedFiles(from, to) {
  const output = git([
    'diff',
    '--name-status',
    '--find-renames',
    from,
    to,
    '--',
    ...WATCHED_PATHS,
  ]);
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parts = line.split('\t');
      return { status: parts[0][0], path: parts.at(-1) };
    });
}

/**
 * Extracts the added lines of one file in a range, with their new line numbers.
 * @param {string} from - start commit.
 * @param {string} to - end commit.
 * @param {string} path - file path.
 * @returns {Array<{line: number, text: string, removed: boolean}>} lines.
 */
function getChangedLines(from, to, path) {
  const output = git(['diff', '-U0', from, to, '--', path]);
  const lines = [];
  let newline = 0;
  for (const raw of output.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = /\+(?<line>\d+)(?:,\d+)?/u.exec(raw);
      newline = match ? Number(match.groups.line) : 0;
      continue;
    }
    if (
      raw.startsWith('+++') ||
      raw.startsWith('---') ||
      raw.startsWith('diff ') ||
      raw.startsWith('index ')
    ) {
      continue;
    }
    if (raw.startsWith('+')) {
      lines.push({ line: newline, text: raw.slice(1), removed: false });
      newline++;
    } else if (raw.startsWith('-')) {
      lines.push({ line: 0, text: raw.slice(1), removed: true });
    }
  }
  return lines;
}

/**
 * Collects the exported symbols of a file change.
 * @param {Array<{text: string, removed: boolean}>} lines - changed lines.
 * @returns {{added: string[], removed: string[]}} symbols.
 */
function getExportedSymbols(lines) {
  const added = [];
  const removed = [];
  for (const line of lines) {
    const match = EXPORT_PATTERN.exec(line.text);
    if (match === null) continue;
    if (line.removed) removed.push(match.groups.name);
    else added.push(match.groups.name);
  }
  return { added, removed };
}

/**
 * Collects the house-style risks found in added lines.
 * @param {string} path - file path.
 * @param {Array<{line: number, text: string, removed: boolean}>} lines - changed lines.
 * @returns {string[]} findings, already formatted.
 */
function getRisks(path, lines) {
  const findings = [];
  for (const line of lines) {
    if (line.removed || line.text.trim() === '') continue;
    for (const rule of RISK_PATTERNS) {
      if (rule.pattern.test(line.text)) {
        findings.push(
          `${path}:${line.line} — ${rule.note}\n  ${line.text.trim()}`,
        );
      }
    }
  }
  return findings;
}

/**
 * Renders the whole report.
 * @param {object} report - collected data.
 * @param {string} report.from - full start SHA.
 * @param {string} report.to - full end SHA.
 * @param {{short: string, date: string, subject: string}} report.fromInfo - start commit description.
 * @param {{short: string, date: string, subject: string}} report.toInfo - end commit description.
 * @param {Array<{sha: string, type: string, subject: string}>} report.commits - commits.
 * @param {Array<{status: string, path: string}>} report.files - changed files.
 * @param {Map<string, {added: string[], removed: string[]}>} report.symbols - exports per file.
 * @param {Map<string, string[]>} report.metadata - added/removed lines of barrels and package.json.
 * @param {string[]} report.risks - style findings.
 * @returns {string} markdown.
 */
function render(report) {
  const out = [];
  const counts = new Map();
  for (const commit of report.commits) {
    counts.set(commit.type, (counts.get(commit.type) ?? 0) + 1);
  }
  out.push(
    `# Style delta — ${report.fromInfo.short}..${report.toInfo.short}`,
    '',
    `- extracted from: \`${report.from}\` (${report.fromInfo.date}) ${report.fromInfo.subject}`,
    `- compared with:  \`${report.to}\` (${report.toInfo.date}) ${report.toInfo.subject}`,
    '',
    'Generated by `scripts/style-delta.mjs`. Fold what changed into `SKILL.md`',
    'and `references/function-anatomy.md`; do not re-read the whole repository.',
    '',
    `- commits: ${report.commits.length}`,
    `- watched files changed: ${report.files.length}`,
    `- commit types: ${[...counts].map(([type, count]) => `${type} ${count}`).join(', ')}`,
    '',
    '## Commits',
    '',
    ...report.commits
      .slice(0, 60)
      .map((commit) => `- ${commit.sha} ${commit.subject}`),
    ...(report.commits.length > 60
      ? [`- … ${report.commits.length - 60} more`]
      : []),
    '',
    '## Files',
    '',
    ...report.files.map((file) => `- ${file.status} ${file.path}`),
    '',
    '',
    '## Public API',
    '',
  );
  let hasSymbols = false;
  for (const [path, symbols] of report.symbols) {
    if (symbols.added.length === 0 && symbols.removed.length === 0) continue;
    hasSymbols = true;
    out.push(`### ${path}`, '');
    if (symbols.added.length > 0) {
      out.push(`- added: ${symbols.added.join(', ')}`);
    }
    if (symbols.removed.length > 0) {
      out.push(`- removed: ${symbols.removed.join(', ')}`);
    }
    out.push('');
  }
  if (!hasSymbols) out.push('No exported symbol added or removed.', '');

  out.push('## Barrels and package metadata', '');
  if (report.metadata.size === 0) {
    out.push('No `index.ts` or `package.json` change.', '');
  } else {
    for (const [path, lines] of report.metadata) {
      out.push(`### ${path}`, '', '```diff', ...lines.slice(0, 40), '```', '');
    }
  }

  out.push('## Style risks in added lines', '');
  if (report.risks.length === 0) out.push('None detected.', '');
  else out.push(...report.risks.map((risk) => `- ${risk}`), '');

  out.push(
    '## Next step',
    '',
    '1. Read only the diffs summarised above.',
    '2. Add a line per new function to `references/function-anatomy.md` if it',
    '   introduces a pattern the file does not describe yet.',
    '3. Update `SKILL.md` only where the delta contradicts it.',
    '4. Run `npm test` before committing the refreshed skill.',
    '',
  );
  return out.join('\n');
}

/**
 * Runs the report and writes it out.
 * @returns {void}
 */
function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  const fromRef = options.from ?? readCheckpoint();
  if (fromRef === undefined) {
    throw new Error(
      'no checkpoint: pass --from <ref> or create references/.checkpoint',
    );
  }
  const from = resolveCommit(fromRef);
  const to = resolveCommit(options.to);

  const commits = getCommits(from, to);
  const files = getChangedFiles(from, to);
  const symbols = new Map();
  const metadata = new Map();
  const risks = [];
  for (const file of files) {
    if (file.status === 'D') continue;
    const lines = getChangedLines(from, to, file.path);
    if (file.path.startsWith('src/')) {
      symbols.set(file.path, getExportedSymbols(lines));
      risks.push(...getRisks(file.path, lines));
    }
    if (file.path.endsWith('index.ts') || file.path === 'package.json') {
      const diff = git(['diff', '-U0', from, to, '--', file.path]);
      const interesting = diff
        .split('\n')
        .filter(
          (line) =>
            (line.startsWith('+') || line.startsWith('-')) &&
            !line.startsWith('+++') &&
            !line.startsWith('---'),
        );
      if (interesting.length > 0) metadata.set(file.path, interesting);
    }
  }

  const markdown = render({
    from,
    to,
    fromInfo: describeCommit(from),
    toInfo: describeCommit(to),
    commits,
    files,
    symbols,
    metadata,
    risks,
  });
  if (options.print) {
    process.stdout.write(markdown);
  } else {
    writeFileSync(options.output, markdown);
    process.stdout.write(`${options.output}\n`);
  }
  if (options.writeCheckpoint) {
    writeFileSync(
      CHECKPOINT_FILE,
      [
        '# Commit whose code this skill was extracted from. --from accepts any',
        '# revision: tag, branch or commit SHA (full or abbreviated).',
        to,
        '',
      ].join('\n'),
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
