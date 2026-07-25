"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const rule = require("../src/rule");

function templateAttribute() {
  return {
    type: "JSXAttribute",
    name: { type: "JSXIdentifier", name: "className" },
    value: {
      type: "JSXExpressionContainer",
      expression: {
        type: "TemplateLiteral",
        quasis: [
          { value: { raw: "flex flex-colum bg-", cooked: "flex flex-colum bg-" } },
          { value: { raw: "-500", cooked: "-500" } },
        ],
        expressions: [{ type: "Identifier", name: "color" }],
      },
    },
  };
}

test("exports a complete ESLint rule contract", () => {
  assert.equal(rule.meta.type, "problem");
  assert.equal(typeof rule.create, "function");
  assert.ok(rule.meta.schema);
  assert.ok(rule.meta.messages.dynamicClass);
});

test("ESLint listener reports a typo and dynamic construction", () => {
  const reports = [];
  const context = {
    options: [{ generatedClasses: ["flex", "flex-col"] }],
    report(report) {
      reports.push(report);
    },
  };

  const listeners = rule.create(context);
  listeners.JSXAttribute(templateAttribute());

  assert.deepEqual(
    reports.map((report) => report.messageId).sort(),
    ["dynamicClass", "possibleTypo"],
  );
  assert.equal(
    reports.find((report) => report.messageId === "possibleTypo").data
      .suggestion,
    "flex-col",
  );
});

test("ESLint listener checks conditional and call expression strings", () => {
  const reports = [];
  const context = {
    options: [{ generatedClasses: ["flex", "block"] }],
    report(report) {
      reports.push(report);
    },
  };
  const listeners = rule.create(context);
  listeners.JSXAttribute({
    type: "JSXAttribute",
    name: { name: "className" },
    value: {
      type: "JSXExpressionContainer",
      expression: {
        type: "CallExpression",
        arguments: [
          { type: "Literal", value: "flex" },
          {
            type: "ConditionalExpression",
            consequent: { type: "Literal", value: "block" },
            alternate: { type: "Literal", value: "gap-7" },
          },
        ],
      },
    },
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "classNotGenerated");
  assert.equal(reports[0].data.name, "gap-7");
});
