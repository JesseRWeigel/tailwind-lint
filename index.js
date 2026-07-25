"use strict";

const rule = require("./src/rule");
const core = require("./src/core");
const source = require("./src/source");

module.exports = {
  rules: {
    "generated-classes": rule,
  },
  configs: {
    recommended: {
      plugins: ["tailwind-generated-lint"],
      rules: {
        "tailwind-generated-lint/generated-classes": "error",
      },
    },
  },
  check: {
    ...core,
    ...source,
  },
};
