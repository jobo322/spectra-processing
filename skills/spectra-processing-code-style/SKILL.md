---
name: spectra-processing-code-style
description: Use when adding, fixing, reviewing or refactoring code in ml-spectra-processing (mljs/spectra-processing), i.e. any change under src/ or benchmark/. Enforces the repository's naming, signature, JSDoc, typing, purity, validation, performance, test and commit conventions so new code looks like the existing functions instead of like a generic TypeScript project.
---

# ml-spectra-processing code style

This is a mature scientific library: TypeScript, ESM (`"type": "module"`), Node
24, vitest, eslint 9 (`eslint-config-cheminfo-typescript`), prettier 3,
semantic-release changelog, six runtime dependencies in total. Read the rules
below as the house style, and `references/function-anatomy.md` for the evidence
taken function by function.

## 1. Naming

- A public function is prefixed by the **category of its first argument**
  (README: "The name of the functions start with the first argument on which
  they apply"):

  | prefix       | first argument                             |
  | ------------ | ------------------------------------------ |
  | `x`          | 1D array (`NumberArray`)                   |
  | `xy`         | `{x, y}`                                   |
  | `xyArray`    | array of `{x, y}`                          |
  | `xyObject`   | array of points `[{x, y}]`                 |
  | `xy2`        | `[[x, y], [x, y]]`                         |
  | `xreim`      | `{x, re, im}`                              |
  | `reim`       | `{re, im}`                                 |
  | `reimArray`  | array of `{re, im}`                        |
  | `reimMatrix` | `{re: Float64Array[], im: Float64Array[]}` |
  | `matrix`     | matrix (`number[][]`, `DoubleMatrix`)      |
  | `zones`      | array of `{from, to}`                      |

  `src/utils/` holds the genuinely generic helpers, which are unprefixed
  (`createFromToArray`, `createStepArray`, `getRescaler`, `isPowerOfTwo`,
  `nextPowerOfTwo`, `recursiveResolve`, `stringify`, `getFFT`).

- One public function per file, file name identical to the function name:
  `src/x/xMedian.ts` exports `xMedian`, `src/xy/xySortX.ts` exports `xySortX`.
  Internal helpers (no prefix, not exported from the barrel) sit either in the
  same file or in `<category>/utils/`.
- Options and result types carry the function name:
  `XRollingOptions`, `XYReduceOptions`, `MatrixZRescaleOptions`,
  `XNoiseSanPlotResult`, `XYPeakInfo`, `SystemMatrix`, `Slot`.
- Shared data shapes live in `src/types/*.ts` and are reused by every module:
  `DataReIm`, `DataXReIm`, `DataReImMatrix`, `Point`, `PointWithIndex`,
  `PointWithClose`. Never redeclare `{x, y}` or `{re, im}` inline.
- Boolean options are assertions on the input, not commands: `sorted`, `exact`,
  `requiredY`, `inPlace`, `magnitudeMode`, `reverse`, `clamp`, `descending`.

## 2. Signature

- Argument order: data → required scalars → `options`.
- `options` is a single object, always defaulted to `{}`, never a positional
  boolean. The few functions with extra scalars keep them for genuine
  algorithm parameters, not flags: `reimPhaseCorrection(data, phi0, phi1,
options)`, `zonesWithPoints(zones, numberOfPoints, options)`.
- Callbacks come after the data and before the options:
  `xRolling(array, fct, options)`, `xyRolling(data, fct, options)`,
  `xyFilter(data, { filter })`.
- Destructure every option once, at the top, with defaults in the pattern:

  ```ts
  const { from = x[0], nbPoints = 4001, optimize = false } = options;
  ```

## 3. Purity

- Never mutate an input, unless an explicit `inPlace?: boolean` option
  (`@default false`) documents it — see `reimFFT`, `reimPhaseCorrection`,
  `reimMatrixPhaseCorrection`, `reimArrayFFT`.
- When callers want to reuse memory, expose an `output?: ArrayType` option and
  validate it through `getOutputArray` (`xRescale`, `xMultiply`, `xNormed`,
  `xDivide`, `reimAbsolute`, `matrixHilbertTransform`).
- Copy explicitly: `.slice()`, `.slice(0)`, `Float64Array.from(...)`,
  `{...zone}`, `matrix.map((row) => row.slice(0))`.
- A helper that genuinely mutates says so, in caps, in its JSDoc:
  `The changes are done in-place !` (`recursiveResolve`,
  `recursiveResolveTasks`, `recursiveUntypeArrays`).

## 4. Validation and errors

- First statement of a public function: `xCheck(array)`,
  `xyCheck(data, { minLength })` or `matrixCheck(matrix)`. Validation is not
  optional.
- Guards are assertion functions typed `asserts input is NumberArray`
  (`xCheck`, `xyCheck`, `xyObjectCheck`) or predicates typed
  `input is NumberArray` (`xIsArray`).
- Error classes have meaning: `TypeError` for a wrong type or length,
  `RangeError` for an invalid numeric domain (empty range, non-positive
  integer, `min >= max`), plain `Error` for an unknown option value.
- Messages name the offending option, lower case, no trailing period:
  `'input must not be empty'`, `'min option must be smaller than max option'`,
  `'the x and y arrays must have the same length'`.
- Unknown enum branches throw with the value interpolated through `String()`:
  ``throw new Error(`unknown distribution: ${String(distribution)}`);``

## 5. Types

- `import type` for types, a separate statement for runtime values.
- Use the `cheminfo-types` vocabulary instead of inline unions: `NumberArray`,
  `DoubleArray`, `DataXY`, `DataXYs`, `DoubleMatrix`, `FromTo`.
- Array-shape preserving functions are generic on the array and return it:

  ```ts
  export function xAbsolute<ArrayType extends NumberArray = NumberArray>(
    array: ArrayType,
  ): ArrayType;
  ```

- Array type selection is an option, named `ArrayConstructor`, documented
  `@default Float64Array`, and flows through `createNumberArray` /
  `createDoubleArray` (`xSequentialFillFromTo`, `matrixCreateEmpty`,
  `matrixTranspose`, `matrixZRescale`).
- New typed arrays are returned as `Float64Array<ArrayBuffer>` (project-wide
  explicit buffer generic). A buffer-reuse option must therefore be typed
  through the function generic (`output?: ArrayType`) or as `DoubleArray`, and
  allocated with `getOutputArray(options.output, length)`: a bare
  `Float64Array` is `Float64Array<ArrayBufferLike>` and does not type-check
  against `Float64Array<ArrayBuffer>`.
- Local imports use explicit `.ts` extensions and no path aliases: a sibling
  file directly (`./xCheck.ts`), another category through its barrel
  (`../x/index.ts`, `../types/index.ts`, `../utils/index.ts`).
- `unknown` + a guard is preferred over `any`; when `any` is unavoidable, a
  scoped `/* eslint-disable @typescript-eslint/no-explicit-any */` with a
  justification comment (`src/utils/stringify.ts`).

## 6. JSDoc

- Every exported symbol has a block with `@param name - sentence.` and
  `@returns sentence.`; inline option objects are documented as
  `@param options.delta - ...` (`xyCheck`, `zeroShift`).
- Every option property documents its default in the interface comment with
  `@default`, including `@default undefined` when the absence is meaningful
  (`xysFilter`).
- Algorithms cite their source: `@link` for a wiki page, `@see DOI: ...` or the
  paper reference (`xHilbertTransform`, `xNoiseSanPlot`,
  `reimAutoPhaseCorrection`).
- Comments explain **why** (measured trade-off, invariant), never what the next
  line does: see the block above `FFTCache`, `RADIX_ORDER_MIN_LENGTH` and the
  `zonesToXEquallySpaced` note.
- Functions whose result is easier to show than to describe carry `@example`
  lines (`xRotate`).
- Type suppression is always justified: `// @ts-expect-error -- reason` in
  sources, `// @ts-expect-error Testing bad argument.` in tests.

## 7. Performance idioms

- Numeric kernels are indexed `for` loops or `while` loops:

  ```ts
  for (let i = 0; i < length; i++) {
    output[i] = array[i] * factor;
  }
  ```

  No `map`/`filter`/`forEach`/`reduce` per element on a hot path, and no
  `for...of` over a typed array (`@typescript-eslint/prefer-for-of` is disabled
  in `eslint.config.js` with the measured explanation).

- Preallocate the output, reuse buffers across calls, accumulate in a single
  pass, and keep allocations out of loops (`reimArrayFFT`, `xysFilter`,
  `getSlots`).
- Bit-level tricks are local and commented: `i >>> 1`, `size << 1`,
  `(n & (n - 1)) === 0`.
- Magic thresholds become named constants with the measurement that justifies
  them (`RADIX_ORDER_MIN_LENGTH`, `LARGE_ARRAY_LENGTH`).
- Any disabled lint rule carries a `-- reason` suffix on the same line
  (`recursiveResolveTasks`, `eslint.config.js`).

## 8. Adding or changing public API

1. New file in the category folder, exported from that folder's `index.ts`
   (keep the list alphabetical).
2. New category: export from `src/index.ts`, create the barrel, add the README
   bullet and a `./<category>` entry in `package.json` `exports`.
3. Update the public API snapshot: `npx vitest run -u src/__tests__`.
4. A breaking signature change is a `feat!:`/`fix!:` conventional commit.
   `CHANGELOG.md` is generated by semantic-release — never edit it by hand.
5. Before pushing: `npm test` (tests + types + eslint + prettier).

## 9. Canonical skeleton

This file, with its test, passes `check-types`, `eslint`, `prettier` and
`vitest` exactly as written; start new array functions from it.

```ts
import type { NumberArray } from 'cheminfo-types';

import { getOutputArray } from './getOutputArray.ts';
import { xCheck } from './xCheck.ts';
import { xGetFromToIndex } from './xGetFromToIndex.ts';

export interface XScaledOptions<ArrayType extends NumberArray = Float64Array> {
  /**
   * First point to consider.
   * @default 0
   */
  fromIndex?: number;

  /**
   * Last point to consider.
   * @default array.length-1
   */
  toIndex?: number;

  /**
   * Output into which to place the data.
   * @default new Float64Array
   */
  output?: ArrayType;
}

/**
 * Multiplies the values by a constant on a range.
 * @param array - array of numbers.
 * @param factor - multiplication factor.
 * @param options - options.
 * @returns the scaled values.
 */
export function xScaled<ArrayType extends NumberArray = Float64Array>(
  array: NumberArray,
  factor: number,
  options: XScaledOptions<ArrayType> = {},
): ArrayType {
  xCheck(array);
  if (!Number.isFinite(factor)) {
    throw new RangeError('factor must be a finite number');
  }
  const output = getOutputArray(options.output, array.length);
  const { fromIndex, toIndex } = xGetFromToIndex(array, options);
  for (let i = 0; i < array.length; i++) {
    output[i] = i >= fromIndex && i <= toIndex ? array[i] * factor : array[i];
  }
  return output;
}
```

And the matching `src/x/__tests__/xScaled.test.ts`:

```ts
import { expect, test } from 'vitest';

import { xScaled } from '../xScaled.ts';

test('should multiply only the requested range', () => {
  const result = xScaled([1, 2, 3, 4], 10, { fromIndex: 1, toIndex: 2 });

  expect(Array.from(result)).toStrictEqual([1, 20, 30, 4]);
});
```

## 10. Keeping the skill current (delta mode)

The skill does not have to be rebuilt by reading the whole repository again.
`references/.checkpoint` records the commit the skill describes (today
`c470879`, v14.35.1); `scripts/style-delta.mjs` summarises only what changed
since then:

```console
node skills/spectra-processing-code-style/scripts/style-delta.mjs
# writes references/style-delta.md and moves the checkpoint to HEAD
node skills/spectra-processing-code-style/scripts/style-delta.mjs --from v14.35.1 --print
node skills/spectra-processing-code-style/scripts/style-delta.mjs --no-checkpoint
```

The report contains the commits of the range with their conventional prefix,
the watched files (`src/`, `benchmark/`, `eslint.config.js`, `.prettierrc.json`,
`tsconfig*.json`, `vitest*`, `package.json`), the exported symbols added or
removed per file, the barrel and `package.json` diffs, and a list of added lines
that look like house-style risks (array helpers on numeric paths, `for...of`
over typed arrays, `any`, `@ts-ignore`, bare `eslint-disable`, unseeded
`Math.random`, `.at(-1)` without cast).

Workflow for a refresh:

1. Run the script.
2. Read `references/style-delta.md` only — never the whole `src/` tree.
3. Add one line per new function to `references/function-anatomy.md` when it
   introduces a pattern that is not described yet; change `SKILL.md` only where
   the delta contradicts it.
4. `npm test`, then commit the refreshed skill together with the new
   `references/.checkpoint` value.

Because the checkpoint is a commit, a shallow clone or a clone that does not
contain it fails loudly (`unknown revision`) instead of silently reading the
wrong range; pass `--from <ref>` in that case.

## References

- `references/function-anatomy.md` — the patterns extracted function by
  function, module by module, with the file that demonstrates each one.
- `references/testing-and-tooling.md` — vitest layout, commands, config files
  and the verified baseline of `main`.
- `references/review-checklist.md` — the checklist to run before a commit, plus
  the bad/good pairs that catch "strange" code.
