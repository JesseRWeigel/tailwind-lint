"use strict";

const fs = require("node:fs");

function decodeCssIdentifier(value) {
  return value.replace(/\\([0-9a-fA-F]{1,6}[ \t\r\n\f]?|.)/gs, (_, escape) => {
    const hex = escape.match(/^[0-9a-fA-F]{1,6}/);
    if (hex) {
      return String.fromCodePoint(Number.parseInt(hex[0], 16));
    }
    return escape;
  });
}

function classesFromSelector(selector) {
  const classes = [];

  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] !== ".") {
      continue;
    }

    let cursor = index + 1;
    let encoded = "";
    while (cursor < selector.length) {
      const char = selector[cursor];
      if (char === "\\") {
        if (cursor + 1 >= selector.length) {
          break;
        }
        encoded += char;
        cursor += 1;
        const hex = selector.slice(cursor).match(/^[0-9a-fA-F]{1,6}[ \t\r\n\f]?/);
        if (hex) {
          encoded += hex[0];
          cursor += hex[0].length;
        } else {
          encoded += selector[cursor];
          cursor += 1;
        }
        continue;
      }
      if (/[\s.#:[\]>+~(),]/.test(char)) {
        break;
      }
      encoded += char;
      cursor += 1;
    }

    if (encoded) {
      classes.push(decodeCssIdentifier(encoded));
    }
    index = Math.max(index, cursor - 1);
  }

  return classes;
}

function extractGeneratedClasses(css) {
  const classes = new Set();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rulePattern = /([^{}]+)\{/g;
  let match;

  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith("@")) {
      continue;
    }
    for (const className of classesFromSelector(prelude)) {
      classes.add(className);
    }
  }

  return classes;
}

function loadGeneratedClasses(cssFiles) {
  const classes = new Set();
  for (const cssFile of cssFiles) {
    const css = fs.readFileSync(cssFile, "utf8");
    for (const className of extractGeneratedClasses(css)) {
      classes.add(className);
    }
  }
  return classes;
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function makeIgnoreMatcher(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function shouldIgnore(className, patterns) {
  return patterns.some((pattern) => makeIgnoreMatcher(pattern).test(className));
}

function suggestClass(className, generatedClasses) {
  const candidates = [];
  for (const generated of generatedClasses) {
    const distance = levenshtein(className, generated);
    const threshold = Math.min(3, Math.max(1, Math.floor(className.length * 0.2)));
    if (distance <= threshold) {
      candidates.push({ className: generated, distance });
    }
  }
  candidates.sort(
    (left, right) =>
      left.distance - right.distance || left.className.localeCompare(right.className),
  );
  return candidates[0]?.className;
}

function diagnoseClass(className, generatedClasses, ignore = []) {
  if (!className || generatedClasses.has(className) || shouldIgnore(className, ignore)) {
    return null;
  }

  const suggestion = suggestClass(className, generatedClasses);
  if (suggestion) {
    return {
      code: "possible-typo",
      className,
      suggestion,
      message: `Class "${className}" was not generated. Did you mean "${suggestion}"?`,
    };
  }

  return {
    code: "class-not-generated",
    className,
    message: `Class "${className}" is absent from the generated CSS. Check the Tailwind content configuration.`,
  };
}

function splitClasses(value) {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

module.exports = {
  classesFromSelector,
  decodeCssIdentifier,
  diagnoseClass,
  extractGeneratedClasses,
  levenshtein,
  loadGeneratedClasses,
  splitClasses,
};
