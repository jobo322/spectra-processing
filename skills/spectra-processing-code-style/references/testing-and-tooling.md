# Tests, tooling and baseline

Verified on `main` at `c470879` (package version 14.35.1), Node 24, after `npm ci`:
`npx vitest run` → **209 test files, 897 tests, all passing in ≈35 s**;
`npm run check-types`, `npx eslint .` and `npx prettier --check .` (repo files)
are clean. A change that breaks any of these is not finished.

## Layout

- Tests live next to the module they cover,
  `src/<category>/__tests__/<functionName>.test.ts`; one source file may be
  covered by several test files (`reimMatrix/__tests__/reimMatrixFFT.test.ts`
  and `reimMatrixFFTByColumns.test.ts`).
- Fixtures: `__tests__/data/*.json` (see `src/reim/__tests__/data/perfect.json`),
  JSON fixtures of typed arrays live in `__tests__/fixtures/*.ts`
  (`matrix/__tests__/fixtures/encoding.ts`).
- Snapshots: `__tests__/__snapshots__/*.test.ts.snap`, used for the public API
  (`src/__tests__/index.test.ts` snapshots `Object.keys` of the entry point)
  and for `stringify`.
- Tests are excluded from the build (`tsconfig.build.json` excludes
  `**/__tests__` and `**/*.test.*`) and from the published package
  (`src/.npmignore`).

## Test style

- Import order: third-party first, then the module under test, blank line
  between groups:

  ```ts
  import { expect, test } from 'vitest';

  import { xMedian } from '../xMedian.ts';
  ```

- `test(...)` at the top level; `describe` is used in only 4 of 209 files, so do
  not add it unless the file already has it.
- Names are lowercase sentences describing behaviour:
  `'should return the median'`, `'no from to'`, `'with from to'`,
  `'should throw on invalid value'`.
- Matchers, by frequency: `toStrictEqual` for objects/arrays, `toBe` for
  numbers, `toThrow(/message/)` for errors, `toBeCloseTo(value, digits)` for
  floats (the digit count is mandatory in practice), `toBeDeepCloseTo` and
  `toMatchCloseTo` for arrays of floats (registered once in `vitest.setup.ts`
  from `jest-matcher-deep-close-to`).
- Errors are asserted as `expect(() => f(input)).toThrow(/input must not be
empty/)`, with the same wording as the source message.
- Leave a blank line around every `expect(...)` statement: the lint rule
  `vitest/padding-around-all` fails otherwise ("expect blank line before this
  statement").
- Invalid input in a test is marked, never silenced:
  `// @ts-expect-error Testing bad argument.` above the offending property.
- No mocks, no fake timers, no network, no filesystem: the library is pure
  maths, tests build their data inline or from a seeded `new XSadd(0)`.
- Random data is always seeded (`new XSadd(42)` in benchmarks, `XSadd(0)` in
  tests) so failures are reproducible.

## Commands

| command                                                             | what it does                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm ci`                                                            | install from `package-lock.json`                              |
| `npm run test-only`                                                 | `vitest run --coverage`                                       |
| `npx vitest run src/x/__tests__/xMedian.test.ts`                    | one file                                                      |
| `npx vitest run -u src/__tests__`                                   | regenerate the API snapshot                                   |
| `npm run check-types`                                               | `tsc --noEmit`                                                |
| `npm run eslint` / `npm run eslint-fix`                             | eslint over `.` (cached)                                      |
| `npm run prettier` / `npm run prettier-write`                       | formatting check / write                                      |
| `npm test`                                                          | test-only + types + eslint + prettier                         |
| `node benchmark/xNumericLoops.ts`                                   | run one benchmark (arguments read from the file header)       |
| `node skills/spectra-processing-code-style/scripts/style-delta.mjs` | refresh the style skill from the changes since its checkpoint |

Benchmarks are plain scripts run by hand with Node's type stripping (or Bun),
they are type-checked but never part of `npm test`.

## Configuration that enforces the style

- `eslint.config.js`: `eslint-config-cheminfo-typescript` on top of
  `eslint/config`, ignores `.claude`, `coverage`, `lib`; the only override is
  `@typescript-eslint/prefer-for-of: 'off'` with the measured justification in
  a comment. Do not add an override without the same kind of comment.
- `.prettierrc.json`: `arrowParens: always`, `semi: true`, `singleQuote: true`,
  `tabWidth: 2`, `trailingComma: all`. Line width stays at the default 80.
- `tsconfig.json`: extends `@zakodium/tsconfig`, `outDir: lib`,
  `noUncheckedIndexedAccess: false` (that is why `.at(-1) as number` casts
  appear), types include `node`, sources include `benchmark` and `vite*.ts`.
- `vitest.config.ts`: coverage over `src/**` excluding `**/__tests__/data/**`,
  `setupFiles: ['vitest.setup.ts']`.
- `package.json` `exports`: each category has its own `./<category>` subpath
  entry (`./matrix`, `./reim`, `./utils`, `./x`, `./xreim`, `./xy`, `./xy2`,
  `./xyArray`, `./xyObject`, `./xys`, `./zones`). A new category is invisible to
  consumers until it is added there.
- `package.json` `files`: only `lib` and `src` are published, and the build is
  `tsc` + `cheminfo-build` (`npm run build`), so `lib/` is never edited by hand.
- `CHANGELOG.md` and the version are produced by semantic-release from
  conventional commit messages; never edit either.

## Commit messages

`feat:`, `fix:`, `perf:`, `docs:`, `test:`, `chore:`, `refactor:` — optionally
scoped to the affected function or module (`fix(xySortX):`, `perf(fft):`,
`chore(main):`), with `!` before the colon for a breaking change (`fix!:`,
`feat!:`). One logical change per commit, imperative, lower case.
