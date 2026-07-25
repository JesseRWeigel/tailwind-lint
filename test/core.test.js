"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  diagnoseClass,
  extractGeneratedClasses,
} = require("../src/core");
const { analyzeSource } = require("../src/source");

const fixtures = path.join(__dirname, "fixtures");
const css = fs.readFileSync(path.join(fixtures, "generated.css"), "utf8");
const generatedClasses = extractGeneratedClasses(css);

test("extracts normal and escaped class selectors from generated CSS", () => {
  assert.deepEqual(
    [...generatedClasses].sort(),
    [
      "bg-red-500",
      "flex",
      "flex-col",
      "hover:underline",
      "text-white",
      "w-1/2",
    ],
  );
});

test("distinguishes close typos from classes absent from the build", () => {
  assert.deepEqual(diagnoseClass("flex-colum", generatedClasses), {
    code: "possible-typo",
    className: "flex-colum",
    suggestion: "flex-col",
    message: 'Class "flex-colum" was not generated. Did you mean "flex-col"?',
  });
  assert.equal(
    diagnoseClass("gap-7", generatedClasses).code,
    "class-not-generated",
  );
  assert.equal(diagnoseClass("flex", generatedClasses), null);
});

test("checks static JSX classes and reports dynamic template construction", () => {
  const source = fs.readFileSync(path.join(fixtures, "problematic.jsx"), "utf8");
  const diagnostics = analyzeSource({
    source,
    filename: "problematic.jsx",
    generatedClasses,
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code).sort(),
    [
      "class-not-generated",
      "class-not-generated",
      "dynamic-class",
      "possible-typo",
    ],
  );
  assert.equal(
    diagnostics.find((diagnostic) => diagnostic.code === "possible-typo")
      .suggestion,
    "flex-col",
  );
  assert.match(
    diagnostics.find((diagnostic) => diagnostic.code === "dynamic-class")
      .expression,
    /bg-\$\{color\}-500/,
  );
  assert.ok(
    diagnostics.every(
      (diagnostic) => diagnostic.line > 0 && diagnostic.column > 0,
    ),
  );
});

test("accepts clean JSX and supports ignored class patterns", () => {
  const clean = fs.readFileSync(path.join(fixtures, "clean.jsx"), "utf8");
  assert.deepEqual(
    analyzeSource({ source: clean, generatedClasses, filename: "clean.jsx" }),
    [],
  );

  const ignored = analyzeSource({
    source: '<i className="icon-user"></i>',
    generatedClasses,
    ignore: ["icon-*"],
  });
  assert.deepEqual(ignored, []);
});

test("does not treat ordinary JavaScript className assignments as JSX", () => {
  const diagnostics = analyzeSource({
    source: [
      'const className = "missing-class";',
      'const config = { className: "also-missing" };',
      'const element = <div className="flex" />;',
    ].join("\n"),
    generatedClasses,
  });
  assert.deepEqual(diagnostics, []);
});
