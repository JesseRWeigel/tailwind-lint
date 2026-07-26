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

## What it correctly handles

Probed by attacking it rather than reading it. Every case below was fired at the linter with a
matching generated CSS file, and it got all of them right.

**Class sources it finds:** `className` and `class` attributes, braced string literals,
string arguments to `clsx`, `cn` and `classnames`, strings inside `&&` shortcuts, and array
literals joined into a class string. A typo in any of those is reported with its line and column.

**Escaped selectors it decodes:** variants like `hover\:bg-blue-600` and `md\:grid-cols-3`,
the important modifier `\!flex`, negatives like `-mt-4`, leading-digit classes such as
`\32xl\:p-8`, arbitrary values with escaped brackets, parens and percent signs like
`w-\[calc\(100\%-2rem\)\]`, descendant variant selectors like `group-hover\:visible`, and
arbitrary variants like `\[\&\>li\]\:mt-2`. Getting these wrong is the main way a naive
implementation produces a flood of false positives on a real Tailwind build.

**Suggestions:** a class one or two edits from a generated one is reported as `possible-typo`
with a "did you mean", rather than as a flat absence. `w-[calc(100%-3rem)]` against a build
containing `w-[calc(100%-2rem)]` gets the suggestion.

## Limitations

- **Dynamic construction is reported, not resolved.** A template literal or a runtime-computed
  class is flagged as `dynamic-class` because Tailwind cannot see it either. The linter does not
  attempt to enumerate the possible values, and a class that only ever appears inside an
  interpolation will not be checked for existence.
- **It compares against a build, not against Tailwind's config.** You have to build your CSS
  first. The upside is that it catches content-glob misconfiguration, which a config-only check
  cannot. The cost is that a stale CSS file produces stale results.
- **A safelisted class that is generated but never used is not reported.** This checks one
  direction, JSX against CSS. Finding dead CSS is the opposite question and is not attempted.
- **No template-language support.** JSX and TSX only. Vue, Svelte, Astro and plain HTML
  templates are not parsed.

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

## License

MIT.
