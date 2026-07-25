"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { main } = require("../bin/tailwind-lint");

const fixture = (name) => path.join(__dirname, "fixtures", name);

function run(arguments_) {
  let stdout = "";
  let stderr = "";
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  process.stdout.write = (value) => {
    stdout += value;
    return true;
  };
  process.stderr.write = (value) => {
    stderr += value;
    return true;
  };
  try {
    return { status: main(arguments_), stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

const findingRun = run(
  [
    "--css",
    fixture("generated.css"),
    "--format",
    "json",
    fixture("problematic.jsx"),
  ],
);

assert.equal(findingRun.status, 1, findingRun.stderr);
const findings = JSON.parse(findingRun.stdout);
assert.deepEqual(
  [...new Set(findings.map((finding) => finding.code))].sort(),
  ["class-not-generated", "dynamic-class", "possible-typo"],
);
assert.equal(
  findings.find((finding) => finding.className === "flex-colum").suggestion,
  "flex-col",
);
assert.match(
  findings.find((finding) => finding.code === "dynamic-class").expression,
  /bg-\$\{color\}-500/,
);

const cleanRun = run(
  ["--css", fixture("generated.css"), fixture("clean.jsx")],
);
assert.equal(cleanRun.status, 0, cleanRun.stderr);
assert.match(cleanRun.stdout, /no problems found/);

process.stdout.write(
  `CLI verification passed: ${findings.length} expected findings, clean fixture exit ${cleanRun.status}\n`,
);
