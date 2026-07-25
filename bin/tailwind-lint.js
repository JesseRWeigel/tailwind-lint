#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadGeneratedClasses } = require("../src/core");
const { analyzeSource } = require("../src/source");
const packageJson = require("../package.json");

function usage() {
  return [
    "Usage: tailwind-lint --css <generated.css> [options] <file-or-directory>...",
    "",
    "Options:",
    "  --css <file>       Generated CSS input. Repeat for multiple files.",
    "  --format <format>  stylish or json. Default: stylish.",
    "  --ignore <glob>    Ignore a class glob such as icon-*.",
    "  --help             Show this help.",
    "  --version          Show the version.",
  ].join("\n");
}

function parseArguments(argv) {
  const options = { cssFiles: [], inputs: [], ignore: [], format: "stylish" };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--version" || argument === "-v") {
      options.version = true;
    } else if (argument === "--css") {
      options.cssFiles.push(argv[++index]);
    } else if (argument === "--format") {
      options.format = argv[++index];
    } else if (argument === "--ignore") {
      options.ignore.push(argv[++index]);
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.inputs.push(argument);
    }
  }

  if (options.cssFiles.some((file) => !file)) {
    throw new Error("--css requires a file path.");
  }
  if (options.ignore.some((pattern) => !pattern)) {
    throw new Error("--ignore requires a glob.");
  }
  if (!["stylish", "json"].includes(options.format)) {
    throw new Error("--format must be stylish or json.");
  }
  return options;
}

function walk(input) {
  const stat = fs.statSync(input);
  if (stat.isFile()) {
    return [input];
  }

  const files = [];
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (/\.[cm]?[jt]sx$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function formatStylish(diagnostics, fileCount) {
  if (diagnostics.length === 0) {
    return `tailwind-lint: no problems found (${fileCount} files)`;
  }
  const lines = diagnostics.map(
    (diagnostic) =>
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}  ${diagnostic.code}  ${diagnostic.message}`,
  );
  lines.push(
    `\n${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"} in ${fileCount} file${fileCount === 1 ? "" : "s"}`,
  );
  return lines.join("\n");
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    return 2;
  }

  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${packageJson.version}\n`);
    return 0;
  }
  if (options.cssFiles.length === 0 || options.inputs.length === 0) {
    process.stderr.write(`At least one --css file and one input are required.\n\n${usage()}\n`);
    return 2;
  }

  try {
    const cssFiles = options.cssFiles.map((file) => path.resolve(file));
    const generatedClasses = loadGeneratedClasses(cssFiles);
    const sourceFiles = [
      ...new Set(options.inputs.flatMap((input) => walk(path.resolve(input)))),
    ].sort();
    const diagnostics = sourceFiles.flatMap((file) =>
      analyzeSource({
        source: fs.readFileSync(file, "utf8"),
        filename: path.relative(process.cwd(), file) || file,
        generatedClasses,
        ignore: options.ignore,
      }),
    );

    const output =
      options.format === "json"
        ? JSON.stringify(diagnostics, null, 2)
        : formatStylish(diagnostics, sourceFiles.length);
    process.stdout.write(`${output}\n`);
    return diagnostics.length > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`tailwind-lint: ${error.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { formatStylish, main, parseArguments, walk };
