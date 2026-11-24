# Function anatomy — what the existing code does

Extracted by reading every module of `src/` at v14.35.1. Each line names the
function and the convention it demonstrates; when a rule in `SKILL.md` is
ambiguous, copy the shape of the file quoted here.

## `src/types/` — the shared vocabulary

- `DataReIm.ts`, `DataXReIm.ts`: generics defaulted to `DoubleArray`
  (`<ArrayType extends DoubleArray = DoubleArray>`), one `/** ... */` per
  property, no `@types` file, no namespace.
- `DataReImMatrix.ts`: rows are `Float64Array[]`, not matrices of matrices.
- `Point.ts`: a base `Point {x, y, index?}` and refinements that extend it
  (`PointWithIndex`, `PointWithClose`) instead of optional fields everywhere.

## `src/utils/` — unprefixed, reusable, no domain prefix

- `createArray.ts`: the only place where `ArrayConstructor`-driven allocation
  lives (`createNumberArray`, `createDoubleArray`), with a conditional type
  `NumberArrayType<C>` so callers keep the concrete array type.
- `createFromToArray.ts`, `createStepArray.ts`, `createRandomArray.ts`:
  options-only signature (`options: XOptions = {}`), every property documented
  with `@default`, `throw new Error(...)` for an unknown strategy.
- `fftCache.ts`: module-level singleton behind exported functions (`getFFT`,
  `clearFFTCache`, `setFFTCacheMaxSize`); a class with `#private` fields and a
  getter/setter pair that validates in the setter (`RangeError` for a non
  positive integer); long `//` comments explaining the cost being avoided.
- `getCombinations.ts` / `getCombinationsIterator.ts`: same algorithm twice, the
  second one a generator typed `Generator<number[], void, undefined>` with
  `@yields`; the memory trade-off is stated in the JSDoc.
- `getRescaler.ts`: returns a closure (`function rescaler(value)`), an internal
  helper throws `` `Unknown kind ${String(kind)}` ``, and range violations use
  `RangeError` with the actual and expected ranges in the message.
- `isPowerOfTwo.ts`, `nextPowerOfTwo.ts`, `isLittleEndian.ts`: tiny predicates,
  one sentence of JSDoc, the expensive constant computed once at module level.
- `recursive*` helpers: take `unknown`, state `The changes are done in-place !`
  in the JSDoc, return the same object; type guards are local predicates
  (`isObject`, `isArray`, `isEmpty`) rather than inline `typeof` chains.
- `stringify.ts`: file-scoped eslint-disable for `no-explicit-any` on line 1,
  `any` only in the public signature, typed arrays converted through
  `ArrayBuffer.isView` + `Array.from`.
- `addWeights.ts` / `createSystemMatrix.ts`: numeric triplet representation
  documented in prose (`lowerTriangularNonZeros`, `permutationEncodedArray`),
  dedicated interface for the result.

## `src/x/` — 1D array functions

- `xAbsolute.ts`: the canonical shape-preserving function — generic
  `<ArrayType extends NumberArray = NumberArray>`, copy with `.slice()`, plain
  indexed loop, `return tmpArray`.
- `xAdd.ts` / `xSubtract.ts`: accept `NumberArray | number` as second operand,
  use `isAnyArray` from `is-any-array` to branch, return a fresh
  `Float64Array<ArrayBuffer>`, throw `'size of array1 and array2 must be
identical'` before allocating. `xMultiply.ts` / `xDivide.ts` are the same
  skeleton plus an `output?: ArrayType` option handled by `getOutputArray`, so
  they return the caller's array type.
- `xCheck.ts`: `asserts input is NumberArray`, options interface
  (`XCheckOptions`) even for a single `minLength`, `TypeError` for every guard.
  `xIsArray.ts` is its boolean twin with identical messages and options.
- `xGetFromToIndex.ts`: returns a named object `{fromIndex, toIndex}` (no tuple),
  clamps to bounds, swaps inverted bounds instead of throwing, documents
  precedence (`fromIndex` wins over `from`) in the property JSDoc.
- `xFindClosestIndex.ts`: an options flag selects the algorithm (`sorted`
  dichotomy vs linear scan) and the JSDoc explains the speed trade-off.
- `xRescale.ts`: `output?: ArrayType` + `getOutputArray` validation,
  `RangeError` for a constant input and for `min >= max`, factor computed once.
- `xMedian.ts`: internal `interface XMedianOptions` (not exported — prefer
  exporting in new code), internal helpers below the public function
  (`quickSelect`, `swap`, `calcMiddle`).
- `xSum.ts`, `xMean.ts`, `xVariance.ts`, `xStandardDeviation.ts`: reduction
  skeleton — `xCheck`, resolve the range with `xGetFromToIndex(array, options)`,
  accumulate in one pass. `xMode.ts` is the exception that only rejects an empty
  array with a `TypeError`.
- `xPadding.ts`: strategy option (`'value' | 'duplicate' | 'circular'`), a
  `switch` with a `default` that throws `` `unknown algorithm ...` ``, and
  `.at(-1) as number` for the last element.
- `xRolling.ts` + `xRollingAverage/Max/Median/Min`: a generic engine taking a
  callback `fct`, thin named wrappers delegating to it with a reducer
  (`xRollingAverage` is three lines).
- `xGetSortOrder.ts` + `x/utils/radixSortOrder.ts`: public wrapper delegating to
  an internal helper, internal helpers deliberately **not** exported from the
  barrel, exported constant `RADIX_ORDER_MIN_LENGTH` with a measured
  justification, hand-written LSD radix sort over `Float64Array` bits.
- `xHilbertTransform.ts`: three implementations selected by options
  (`forceFFT`), every helper documented with `@param`/`@returns`, `@link` and
  `@see DOI:` citations.
- `xNoiseSanPlot.ts`: exported options + exported result interface, private
  helpers with an internal `PrepareDataOptions` interface, `@default:` with a
  sentence when the value is computed, returns `x`/`y` objects for plots.
- `xApplyFunctionStr.ts`: dynamic `new Function` isolated behind two
  file-scoped eslint-disables that name the exact rules.
- `xSequentialFillFromTo.ts`: typed array selection propagated to a second
  function (`xSequentialFillFromStep`), parameters grouped in a
  `XSequentialFillFromToParameters` interface.
- `xRotate.ts`, `xCumulative.ts`, `xUniqueSorted.ts`: allocate a new output and
  return it; `xRotate` carries `@example` lines that show the API by example.
- `xSortAscending.ts` / `xSortDescending.ts`: sort **in place** and say so in
  the JSDoc ("in place !"), then throw `'trying to sort non array'` for
  anything that is neither a typed array nor an array.

## `src/xy/` — `{x, y}` functions

- `xyCheck.ts`: `asserts data is { x: AnyArray; y: AnyArray }`, inline options
  object with `@param options.minLength`, `@ts-expect-error` comments only where
  narrowing cannot follow.
- `xyMaxYPoint.ts` / `xyMinYPoint.ts` / `xyMaxClosestYPoint.ts`: identical
  skeleton — `xyCheck(data, { minLength: 1 })`, early return for a single point,
  `xGetFromToIndex`, one pass keeping `PointWithIndex`, options interface
  repeated per function (`XYMaxYPointOptions`) with `from`/`fromIndex`/`to`/
  `toIndex` documented the same way everywhere.
- `xyRealMaxYPoint.ts`: interpolation maths with a comment naming the model
  ("interpolation to a sin() function"), plain `options = {}` when the options
  are only forwarded.
- `xyIntegration.ts` / `xyIntegral.ts`: returns a scalar / cumulative
  `DataXY<Float64Array>`, all indices local, `if (x.length === 1) return 0`.
- `xySortX.ts`: fast path for already monotonic data, radix order above
  `RADIX_ORDER_MIN_LENGTH`, comparator sort below it, always returns
  `DataXY<Float64Array>`.
- `xyReduce.ts`: internal `InternalZone` interface, nested helper `appendFromTo`
  declared after `return` inside the function, `// todo` left in place, the
  public contract ("SHOULD NOT BE USED FOR DATA PROCESSING !!!") stated in caps.
- `xyFilter.ts` / `xyExtract.ts`: optional callback option (`filter`), `let
{ zones }` before normalization, returns plain `number[]` objects.
- `xyRolling.ts`: forwards to `xRolling`, recomputes `x` only when the length
  changed.
- `xyPeakInfo.ts`: exported result interface `XYPeakInfo` describing every
  field, returns `undefined` for too-short input, throws when neither `target`
  nor `targetIndex` is given.

- `recursiveRemoveEmptyAndNull.ts`: third-party code keeps its license header,
  internal functions are documented with `@param`/`@returns` as thoroughly as
  the public one.

## `src/xyObject/` — arrays of points

- `xyObjectCheck.ts`: `asserts points is Point[]`, `minLength` defaulting to `0`
  (an empty list is valid), the same message reused for two different failures.
- `xyObjectMaxYPoint.ts`: default parameter `points: Point[] = []`, returns
  `{x: 0, y: 0}` for the empty case instead of throwing, named `Points`
  arguments plural where the input is a list.
- `xyObjectSlotX.ts`: `slotWidth` option, `Number.NEGATIVE_INFINITY` as a
  sentinel, `Math.abs(current.x - slot) > Number.EPSILON` comparison.
- `xyObjectBestPoints.ts`: options with computed defaults
  (`from = xyObjectMinXPoint(points).x`), a labelled loop
  (`peakLoop: for (...)`) with `continue peakLoop`, `{...item.point, close}`,
  `PointWithClose`.
- `xyObjectToXY.ts`: one-liner conversion with `points.map((entry) => entry.x)`
  — mapping is fine when it is not a numeric hot loop.

## `src/xyArray/`, `src/xys/`, `src/xy2/`

- `xyArrayAlign.ts` / `xyArrayMerge.ts`: same skeleton, shared internal helper
  in `xyArray/utils/getSlots.ts` with its own exported `GetSlotsOptions` and
  `Slot` interface, `delta?: ((arg: number) => number) | number` option
  documented identically in both, `Uint32Array` cursors.
- `xyArrayAlignByIntensity.ts`: the best example of a long JSDoc — the algorithm,
  its guarantees ("no intensity is created or lost"), its limits (dense matrix
  memory) and the alternatives are all in the comment, followed by a `@param`,
  `@param options.`, `@returns` list.
- `xysFilter.ts`: every option documented with when it applies and the
  interaction between options stated in prose ("`minY` only says what they count
  as contained"), two-pass count-then-fill instead of building intermediate
  arrays.
- `xy2ToXY.ts`: type alias through `DataXY<number[]>`; no defensive copy.

## `src/zones/`

- `zonesNormalize.ts`: recursive call on the exclusions, `let { from, to } =
options` when values get rewritten, in-place mutation of freshly created zone
  objects only, comments marking each case of the sweep.
- `zonesWithPoints.ts`: a positional `numberOfPoints = 10` second argument
  (documented inline with `@param` directly above the parameter), result
  interface `FromToWithNumberOfPoints extends FromTo`.
- `zonesToXEquallySpaced.ts`: `RangeError` for empty zones and for
  `numberOfPoints < 1`, `options.from ?? zones[0].from`,
  `//@ts-expect-error zones is tested before` on the `.at(-1)` access.

## `src/reim/`, `src/reimArray/`, `src/reimMatrix/`, `src/xreim/`

- `reimAbsolute.ts`: inline options object (`options: { output?: DoubleArray } =
{}`) acceptable for a single option, `Math.hypot`, default allocated in the
  destructuring.
- `reimFFT.ts`: `inPlace`, `inverse`, `applyZeroShift` flags, `size << 1` and
  `i >>> 1` packing of the complex buffer, single `getFFT(size)` instance,
  returns `DataReIm<Float64Array>` and casts `data` only on the `inPlace` path.
- `reimPhaseCorrection.ts`: scalar angle arguments before options, `phi0 =
Number.isFinite(phi0) ? phi0 : 0` sanitizing, incremental rotation with a
  comment ("stable incremental rotation"), result array chosen once
  (`inPlace ? re : new Float64Array(length)`).
- `reimMatrixPhaseCorrection.ts`: result interface extending the input
  (`extends DataReImMatrix` plus min/max), early return for an empty matrix,
  `RangeError` listing the offending row, two symmetric branches for
  `'rows'`/`'columns'`.
- `reimAutoPhaseCorrection.ts`: exported result type inline
  (`{ data, ph0, ph1 }`), the paper reference in the JSDoc, helper functions
  named after the maths (`holoborodko`, `robustBaseLineRegionsDetection`,
  `weightedLinearRegression`), each with its own JSDoc.
- `reimZeroFilling.ts` / `xreimZeroFilling.ts`: validate `totalLength`
  (`Number.isInteger`, `RangeError`), return the input untouched when the length
  is unchanged, preserve the input array type through
  `createDoubleArray(re.constructor as DoubleArrayConstructor, ...)`.
- `xreimSortX.ts`: length check with `TypeError`, uses `toReversed()`, casts the
  result back to `ArrayType`.
- `zeroShift.ts`: single `Float64Array` contract, boolean argument documented
  with `@param inverse -`.

## `src/matrix/`

- `matrixCheck.ts`: no return type annotation needed (`: void` is written
  explicitly), `RangeError` for empty and ragged input.
- `matrixClone.ts`: generic `<ValueType>(matrix: ValueType[][])`, one line.
- `matrixTranspose.ts` / `matrixZRescale.ts`: generic over
  `ArrayConstructorType`, delegate allocation to `matrixCreateEmpty`, `nbRows` /
  `nbColumns` naming, loops ordered to walk memory contiguously.
- `matrixCreateEmpty.ts`: options-only signature, defaults derived from a
  reference matrix (`matrix?.length || 1`), `ArrayConstructor = Float64Array as
ArrayConstructorType`.
- `matrixNumericalEncoding.ts`: returns a dictionary next to the matrix,
  documents it as `Record<string, number>`.
- `matrixAbsoluteMedian.ts`: flattens into one `Float64Array` then calls
  `xMedian` — reuse across categories instead of reimplementing statistics.

## `benchmark/`

- One file per questioned hot path, `/* eslint-disable no-console */` on line 1,
  imported from `../src/...` with explicit `.ts`, deterministic data from
  `new XSadd(42)`, a comment above each entry explaining what is compared and
  why the crossover is where it is.
