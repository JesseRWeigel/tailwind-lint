# tailwind-lint

An ESLint rule plus standalone checker that cross-references every class string in JSX against the classes Tailwind actually generated for the build, reporting typos (flex-colum), classes killed by content-glob misconfiguration, and dynamically constructed class names that Tailwind can never see.

Catalog task: `DEVT-012`. Part of [thousand](../../README.md).

**[Read this on the web](https://jesserweigel.github.io/tailwind-lint/)**

## What this is

`tailwind-lint` provides an ESLint rule and a standalone command that compare JSX
`class` and `className` values with selectors in generated Tailwind CSS. The checker
distinguishes likely typos from classes missing in the generated build and flags class names
assembled with template interpolation or string concatenation.

The standalone command takes generated CSS as an explicit input. This avoids assuming a
Tailwind version or build tool and makes content-glob failures visible in the CSS that the
application actually ships.

## Running it

No install step is required for development. Node.js 20 or newer is the only dependency.

Run the standalone checker against a generated stylesheet and one or more JSX or TSX files:

```bash
node bin/tailwind-lint.js --css dist/tailwind.css src/
```

Use JSON output in editor or CI integrations:

```bash
node bin/tailwind-lint.js --css dist/tailwind.css --format json src/
```

The command exits 0 when every inspected class exists, 1 when it finds lint problems, and 2
for invalid arguments or unreadable inputs. `--ignore 'icon-*'` suppresses classes owned by
another CSS system.

Configure the ESLint rule in a flat configuration:

```js
const tailwindLint = require("tailwind-generated-lint");

module.exports = [
  {
    plugins: { "tailwind-generated-lint": tailwindLint },
    rules: {
      "tailwind-generated-lint/generated-classes": [
        "error",
        { cssFiles: ["dist/tailwind.css"], ignore: ["icon-*"] },
      ],
    },
  },
];
```

The stylesheet paths are resolved from the working directory where ESLint starts.

Run all unit tests and behavioral CLI checks with:

```bash
npm run verify
```

`npm run verify` is the project verification command. It exercises escaped Tailwind
selectors, typo suggestions, absent build classes, dynamic templates, the ESLint listener,
CLI exit codes, JSON output, and a clean CLI run.

## Status

Verified locally with Node.js v24.13.0. Pasted output from `npm run verify`:

```text
> tailwind-generated-lint@0.1.0 verify
> node --test test/*.test.js && node bin/tailwind-lint.js --css test/fixtures/generated.css test/fixtures/clean.jsx && node test/verify-cli.js

✔ test/cli.test.js (61.508389ms)
✔ test/core.test.js (62.138891ms)
✔ test/rule.test.js (66.043047ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 77.052072
tailwind-lint: no problems found (1 files)
CLI verification passed: 4 expected findings, clean fixture exit 0
```

## Unfinished

- The standalone scanner does not resolve class values hidden behind identifiers or returned
  from user-defined helper functions. The ESLint rule handles literals in common calls,
  arrays, conditional expressions, logical expressions, templates, and concatenations.
- A typo suggestion is based on edit distance to generated selectors. Generated CSS alone
  cannot prove whether an absent class came from a spelling mistake or Tailwind content
  configuration, so every absent class still carries a precise diagnostic.
- The tool does not run the Tailwind build. CI should generate CSS before running this checker.
