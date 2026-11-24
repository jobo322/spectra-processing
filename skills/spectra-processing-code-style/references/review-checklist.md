# Review checklist

Run this before every commit, and when reviewing a pull request.

## Checklist

1. **Name** — first-argument prefix (`x`, `xy`, `xyArray`, `xyObject`, `xy2`,
   `xreim`, `reim`, `reimArray`, `reimMatrix`, `matrix`, `zones`), or unprefixed
   only inside `src/utils/`.
2. **File** — `src/<category>/<functionName>.ts`, one public function, exported
   from the category `index.ts` (alphabetical), and from `src/index.ts` only if
   the category is new.
3. **Signature** — data first, then required scalars, then
   `options: XOptions = {}`; no positional flags; callback before options.
4. **Options** — destructured once at the top, defaults in the pattern, every
   property carrying `@default` in its interface comment.
5. **Docs** — `/** ... */` with `@param name - ...`, `@returns ...`,
   `@param options.key - ...` for inline objects, `@link`/`@see DOI:` for papers,
   a **why** comment for any non-obvious constant or trade-off.
6. **validation** — `xCheck` / `xyCheck` / `matrixCheck` as the first statement;
   `TypeError` for types and lengths, `RangeError` for domains, `Error` for
   unknown option values, message naming the option.
7. **Purity** — input untouched (`.slice()`, `from`, spread) unless `inPlace`
   is an explicit `@default false` option; `output` when buffer reuse matters.
8. **Types** — `import type` for types, `cheminfo-types` aliases instead of
   inline unions, shape-preserving generics, `Float64Array<ArrayBuffer>` for new
   typed arrays, no unjustified `any`.
9. **Loops** — indexed `for`/`while` in numeric kernels, preallocated output,
   nothing allocated inside a loop, `for...of` not used over typed arrays.
10. **Tests** — `src/<category>/__tests__/<functionName>.test.ts`, `vitest`
    imports, seeded random data, `toStrictEqual`/`toBeCloseTo(v, digits)`/
    `toBeDeepCloseTo`, error messages asserted, `// @ts-expect-error Testing bad
argument.` for invalid inputs.
11. **API snapshot** — new or renamed exports regenerate
    `src/__tests__/__snapshots__/index.test.ts.snap` (`npx vitest run -u
src/__tests__`), and the snapshot diff is part of the commit.
12. **Gate** — `npm test` (tests + `check-types` + `eslint` + `prettier`) is
    green.
13. **Commit** — conventional prefix, optional scope, `!` for breaking,
    `CHANGELOG.md` untouched.

## Strange style → house style

| Instead of                                               | Write                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `export function median(array)`                          | `export function xMedian(input: NumberArray, options: XMedianOptions = {})` |
| `interface Options { … }`                                | `export interface XYThingOptions { … }`                                     |
| `f(data, true, false)`                                   | `f(data, { sorted: true, exact: false })`                                   |
| `options.isSorted` / `options.useFFT`                    | `options.sorted` / `options.forceFFT`                                       |
| `data.map(...)`, `reduce`, `forEach` on a hot path       | indexed `for (let i = 0; i < length; i++)`                                  |
| `for (const v of float64Array)`                          | indexed loop over `float64Array[i]`                                         |
| `array[i] = array[i] * 2` inside the given input         | copy first, or add `inPlace` and document it                                |
| `throw new Error('invalid')`                             | `throw new RangeError('min option must be smaller than max option')`        |
| `throw new Error('unknown ' + kind)`                     | ``throw new Error(`unknown kind ${String(kind)}`)``                         |
| `{x: number[]; y: number[]}` inline                      | `DataXY`, `DataXY<Float64Array>`, `Point`, `DataReIm` …                     |
| `as any` / `// @ts-ignore`                               | `unknown` + guard, or `// @ts-expect-error -- reason`                       |
| `// eslint-disable-next-line` with no reason             | fix the code, or add `-- reason` on the same line                           |
| `import { xCheck } from '../x'`                          | `import { xCheck } from '../x/index.ts'`                                    |
| `import { xCheck } from './xCheck'`                      | `import { xCheck } from './xCheck.ts'`                                      |
| a new local helper duplicating existing maths            | reuse `src/utils/`, `src/x/`, `src/zones/`, `<category>/utils/`             |
| a new dependency for a small utility                     | keep the dependency count at six and write the helper                       |
| editing `lib/`, `CHANGELOG.md` or `package.json` version | change `src/`, let the tooling and semantic-release do the rest             |
| `describe`/`it` style in a new test                      | `test('should …', () => { … })`                                             |
| unseeded `Math.random()` in a test or benchmark          | `new XSadd(seed)`                                                           |
| a magic number such as `150` in a comparison             | a named constant with the measurement in a comment                          |

## Questions a reviewer asks

- What happens with an empty array, a single point, `NaN`, an inverted range?
  (The code base answers all three, repeatedly: early return, `minLength`,
  clamp or `RangeError`.)
- Does the new function mutate something the caller still owns?
- Can the output be produced in one pass, with a typed array allocated once?
- Does the JSDoc say what the function does **and** why it is done that way?
- Is the new symbol reachable through the barrel, the `exports` map and the API
  snapshot?
- Would this change be a `feat:` or a `fix:` in the changelog, and does it need
  a `!`?
