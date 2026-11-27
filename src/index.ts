#!/usr/bin/env node
import { run } from "./cli.js";

run(process.argv.slice(2)).then(({ exitCode, stdout }) => {
  process.stdout.write(`${stdout}\n`);
  process.exitCode = exitCode;
});
