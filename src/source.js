"use strict";

const { diagnoseClass, splitClasses } = require("./core");

function positionAt(source, index) {
  const before = source.slice(0, index);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function readQuoted(source, start) {
  const quote = source[start];
  let value = "";

  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1];
      const simpleEscapes = { n: "\n", r: "\r", t: "\t" };
      value += simpleEscapes[next] ?? next ?? "";
      index += 1;
      continue;
    }
    if (char === quote) {
      return { value, end: index + 1 };
    }
    value += char;
  }

  return null;
}

function readBalancedExpression(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { value: source.slice(start + 1, index), end: index + 1 };
      }
    }
  }

  return null;
}

function findJsxOpeningTags(source) {
  const tags = [];

  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "<" || !/[A-Za-z]/.test(source[start + 1] ?? "")) {
      continue;
    }

    let braceDepth = 0;
    let quote = null;
    let escaped = false;
    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        quote = char;
      } else if (char === "{") {
        braceDepth += 1;
      } else if (char === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (char === ">" && braceDepth === 0) {
        tags.push({ start, end: index + 1, source: source.slice(start, index + 1) });
        start = index;
        break;
      }
    }
  }

  return tags;
}

function findStringLiterals(expression) {
  const values = [];
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] !== "'" && expression[index] !== '"') {
      continue;
    }
    const result = readQuoted(expression, index);
    if (!result) {
      break;
    }
    values.push({ value: result.value, index });
    index = result.end - 1;
  }
  return values;
}

function findTemplates(expression) {
  const templates = [];
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] !== "`") {
      continue;
    }

    let cursor = index + 1;
    let escaped = false;
    while (cursor < expression.length) {
      const char = expression[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "`") {
        const raw = expression.slice(index, cursor + 1);
        templates.push({ raw, index, dynamic: raw.includes("${") });
        index = cursor;
        break;
      }
      cursor += 1;
    }
  }
  return templates;
}

function stableTemplateClasses(raw) {
  const inner = raw.slice(1, -1);
  const marked = inner.replace(/\$\{[\s\S]*?\}/g, "\u0000");
  return splitClasses(marked).filter((token) => !token.includes("\u0000"));
}

function classDiagnostics(value, generatedClasses, ignore) {
  return splitClasses(value)
    .map((className) => diagnoseClass(className, generatedClasses, ignore))
    .filter(Boolean);
}

function analyzeExpression(expression, generatedClasses, ignore) {
  const diagnostics = [];
  const templates = findTemplates(expression);

  for (const template of templates) {
    if (template.dynamic) {
      diagnostics.push({
        code: "dynamic-class",
        expression: template.raw,
        index: template.index,
        message: `Dynamic class construction ${template.raw} cannot be discovered reliably by Tailwind. Use complete class names.`,
      });
      for (const className of stableTemplateClasses(template.raw)) {
        const diagnostic = diagnoseClass(className, generatedClasses, ignore);
        if (diagnostic) {
          diagnostics.push({ ...diagnostic, index: template.index + 1 });
        }
      }
    } else {
      for (const diagnostic of classDiagnostics(
        template.raw.slice(1, -1),
        generatedClasses,
        ignore,
      )) {
        diagnostics.push({ ...diagnostic, index: template.index + 1 });
      }
    }
  }

  const expressionWithoutTemplates = expression.replace(/`(?:\\.|[^`])*`/gs, "");
  const strings = findStringLiterals(expressionWithoutTemplates);
  if (expressionWithoutTemplates.includes("+") && strings.length > 0) {
    diagnostics.push({
      code: "dynamic-class",
      expression: expression.trim(),
      index: Math.max(0, expression.search(/\S/)),
      message: `Dynamic class construction "${expression.trim()}" cannot be discovered reliably by Tailwind. Use complete class names.`,
    });
    return diagnostics;
  }

  for (const string of strings) {
    for (const diagnostic of classDiagnostics(string.value, generatedClasses, ignore)) {
      diagnostics.push({ ...diagnostic, index: string.index + 1 });
    }
  }
  return diagnostics;
}

function analyzeSource({
  source,
  filename = "<input>",
  generatedClasses,
  ignore = [],
}) {
  const diagnostics = [];
  const attributePattern = /\b(?:className|class)\s*=/g;
  for (const tag of findJsxOpeningTags(source)) {
    attributePattern.lastIndex = 0;
    let match;
    while ((match = attributePattern.exec(tag.source)) !== null) {
      let localValueStart = attributePattern.lastIndex;
      while (/\s/.test(tag.source[localValueStart] ?? "")) {
        localValueStart += 1;
      }
      const valueStart = tag.start + localValueStart;

      const quote = source[valueStart];
      if (quote === "'" || quote === '"') {
        const result = readQuoted(source, valueStart);
        if (!result) {
          continue;
        }
        for (const diagnostic of classDiagnostics(
          result.value,
          generatedClasses,
          ignore,
        )) {
          const position = positionAt(source, valueStart + 1);
          diagnostics.push({ ...diagnostic, file: filename, ...position });
        }
        attributePattern.lastIndex = result.end - tag.start;
        continue;
      }

      if (source[valueStart] === "{") {
        const result = readBalancedExpression(source, valueStart);
        if (!result) {
          continue;
        }
        for (const diagnostic of analyzeExpression(
          result.value,
          generatedClasses,
          ignore,
        )) {
          const position = positionAt(source, valueStart + 1 + diagnostic.index);
          diagnostics.push({ ...diagnostic, file: filename, ...position });
        }
        attributePattern.lastIndex = result.end - tag.start;
      }
    }
  }

  return diagnostics;
}

module.exports = {
  analyzeExpression,
  analyzeSource,
  findStringLiterals,
  findTemplates,
  findJsxOpeningTags,
  positionAt,
  stableTemplateClasses,
};
