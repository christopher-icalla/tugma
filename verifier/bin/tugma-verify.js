#!/usr/bin/env node
import { main } from "../src/cli.js";
import { testnetReader } from "../src/index.js";

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
process.exitCode = await main(process.argv.slice(2), { reader: (opts) => testnetReader(strip(opts)) });
