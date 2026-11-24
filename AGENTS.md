# AGENTS.md

This repository has a documented house style. Before editing anything under
`src/` or `benchmark/`, read
[`skills/spectra-processing-code-style/SKILL.md`](skills/spectra-processing-code-style/SKILL.md)
and the references it points to:

- [`references/function-anatomy.md`](skills/spectra-processing-code-style/references/function-anatomy.md)
  — the conventions extracted function by function from the existing code.
- [`references/testing-and-tooling.md`](skills/spectra-processing-code-style/references/testing-and-tooling.md)
  — test layout, commands, config files.
- [`references/review-checklist.md`](skills/spectra-processing-code-style/references/review-checklist.md)
  — checklist and strange-style → house-style table.

## Non-negotiables

- Public function names start with the prefix of their first argument (`x`,
  `xy`, `xyArray`, `xyObject`, `xy2`, `xreim`, `reim`, `reimArray`,
  `reimMatrix`, `matrix`, `zones`); helpers in `src/utils/` are unprefixed.
- One file per public function, named after it, exported from the category
  barrel.
- `(data, requiredScalars, options: XOptions = {})`; no positional flags.
- Validate first with `xCheck` / `xyCheck` / `matrixCheck`; never mutate the
  input unless an `inPlace` option says so.
- `@param`/`@returns`/`@default` JSDoc on everything public.
- Indexed loops and preallocated typed arrays in numeric code.
- Tests in `src/<category>/__tests__/<functionName>.test.ts`, plus the API
  snapshot when exports change.

## Verify before you finish

```console
npm run test-only
npm run check-types
npm run eslint
npm run prettier
```

or simply `npm test`. Conventional commit messages only (`feat:`, `fix:`,
`perf:`, `docs:`, `test:`, `chore:`, `refactor:`, `!` when breaking);
`CHANGELOG.md` is generated, never edited.

## Keeping the skill current

The skill describes the code at the commit stored in
`skills/spectra-processing-code-style/references/.checkpoint`. To refresh it
without re-reading the whole repository:

```console
node skills/spectra-processing-code-style/scripts/style-delta.mjs
```

It writes `references/style-delta.md` with the commits, files, exported symbols,
barrel/`package.json` diffs and style-risk lines since that checkpoint; fold
those into the skill and commit the new checkpoint with it.
