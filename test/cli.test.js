"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { main } = require("../bin/tailwind-lint");

const css = path.join(__dirname, "fixtures", "generated.css");

function run(...arguments_) {
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

test("standalone CLI exits 1 and emits machine-readable diagnostics", () => {
  const result = run(
    "--css",
    css,
    "--format",
    "json",
    path.join(__dirname, "fixtures", "problematic.jsx"),
  );
  assert.equal(result.status, 1, result.stderr);
  const diagnostics = JSON.parse(result.stdout);
  assert.ok(diagnostics.some((item) => item.code === "dynamic-class"));
  assert.ok(diagnostics.some((item) => item.code === "possible-typo"));
  assert.ok(diagnostics.some((item) => item.code === "class-not-generated"));
});

test("standalone CLI exits 0 for classes present in generated CSS", () => {
  const result = run(
    "--css",
    css,
    path.join(__dirname, "fixtures", "clean.jsx"),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no problems found \(1 files\)/);
});

test("standalone CLI reserves exit 2 for usage and input failures", () => {
  const result = run("--format", "yaml", "missing.jsx");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /stylish or json/);
});
