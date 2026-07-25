"use strict";

const path = require("node:path");
const {
  diagnoseClass,
  loadGeneratedClasses,
  splitClasses,
} = require("./core");

function literalString(node) {
  if (!node) {
    return null;
  }
  if (typeof node.value === "string" && (node.type === "Literal" || node.type === "StringLiteral")) {
    return node.value;
  }
  return null;
}

function staticBinaryValue(node) {
  if (!node || node.type !== "BinaryExpression" || node.operator !== "+") {
    return literalString(node);
  }
  const left = staticBinaryValue(node.left);
  const right = staticBinaryValue(node.right);
  return left === null || right === null ? null : left + right;
}

function collectExpressionEntries(node, entries) {
  if (!node) {
    return;
  }

  const literal = literalString(node);
  if (literal !== null) {
    entries.push({ kind: "static", value: literal, node });
    return;
  }

  if (node.type === "TemplateLiteral") {
    if (node.expressions.length === 0) {
      entries.push({
        kind: "static",
        value: node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(""),
        node,
      });
    } else {
      const display = node.quasis
        .map((quasi, index) => {
          const text = quasi.value.raw;
          return index < node.expressions.length ? `${text}\${...}` : text;
        })
        .join("");
      entries.push({ kind: "dynamic", value: `\`${display}\``, node });

      const stable = node.quasis
        .map((quasi, index) => {
          const text = quasi.value.cooked ?? quasi.value.raw;
          return index < node.expressions.length ? `${text}\u0000` : text;
        })
        .join("");
      for (const token of splitClasses(stable)) {
        if (!token.includes("\u0000")) {
          entries.push({ kind: "static", value: token, node });
        }
      }
    }
    return;
  }

  if (node.type === "BinaryExpression" && node.operator === "+") {
    const value = staticBinaryValue(node);
    entries.push(
      value === null
        ? { kind: "dynamic", value: "string concatenation", node }
        : { kind: "static", value, node },
    );
    return;
  }

  if (node.type === "ConditionalExpression") {
    collectExpressionEntries(node.consequent, entries);
    collectExpressionEntries(node.alternate, entries);
    return;
  }
  if (node.type === "LogicalExpression") {
    collectExpressionEntries(node.left, entries);
    collectExpressionEntries(node.right, entries);
    return;
  }
  if (node.type === "ArrayExpression") {
    for (const element of node.elements) {
      collectExpressionEntries(element, entries);
    }
    return;
  }
  if (node.type === "CallExpression") {
    for (const argument of node.arguments) {
      if (argument.type !== "SpreadElement") {
        collectExpressionEntries(argument, entries);
      }
    }
  }
}

function reportEntry(context, entry, generatedClasses, ignore) {
  if (entry.kind === "dynamic") {
    context.report({
      node: entry.node,
      messageId: "dynamicClass",
      data: { expression: entry.value },
    });
    return;
  }

  for (const className of splitClasses(entry.value)) {
    const diagnostic = diagnoseClass(className, generatedClasses, ignore);
    if (!diagnostic) {
      continue;
    }
    context.report({
      node: entry.node,
      messageId:
        diagnostic.code === "possible-typo" ? "possibleTypo" : "classNotGenerated",
      data: {
        name: diagnostic.className,
        suggestion: diagnostic.suggestion,
      },
    });
  }
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Compare JSX classes with selectors in generated Tailwind CSS.",
    },
    schema: [
      {
        type: "object",
        properties: {
          cssFiles: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" }, minItems: 1 },
            ],
          },
          generatedClasses: {
            type: "array",
            items: { type: "string" },
          },
          ignore: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      classNotGenerated:
        'Class "{{name}}" is absent from the generated CSS. Check the Tailwind content configuration.',
      possibleTypo:
        'Class "{{name}}" was not generated. Did you mean "{{suggestion}}"?',
      dynamicClass:
        'Dynamic class construction "{{expression}}" cannot be discovered reliably by Tailwind. Use complete class names.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    let generatedClasses;
    if (options.generatedClasses) {
      generatedClasses = new Set(options.generatedClasses);
    } else {
      const configured = options.cssFiles ?? ["dist/tailwind.css"];
      const files = (Array.isArray(configured) ? configured : [configured]).map((file) =>
        path.resolve(process.cwd(), file),
      );
      generatedClasses = loadGeneratedClasses(files);
    }
    const ignore = options.ignore ?? [];

    return {
      JSXAttribute(node) {
        const name = node.name?.name;
        if (name !== "class" && name !== "className") {
          return;
        }

        const entries = [];
        const literal = literalString(node.value);
        if (literal !== null) {
          entries.push({ kind: "static", value: literal, node: node.value });
        } else if (node.value?.type === "JSXExpressionContainer") {
          collectExpressionEntries(node.value.expression, entries);
        }
        for (const entry of entries) {
          reportEntry(context, entry, generatedClasses, ignore);
        }
      },
    };
  },
};

module.exports.collectExpressionEntries = collectExpressionEntries;
module.exports.staticBinaryValue = staticBinaryValue;
