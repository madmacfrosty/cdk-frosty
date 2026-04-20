import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { parse } from './parser';
import { loadRules } from './rules/registry';
import { execute } from './engine';
import { render } from './renderer';
import { ArchGraph } from './engine/types';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function loadRenderer(rendererPath: string, graph: ArchGraph): string {
  if (!require('fs').existsSync(rendererPath)) {
    throw { exitCode: 5, message: `Renderer module not found: ${rendererPath}` };
  }

  let mod: unknown;
  try {
    mod = require(rendererPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw { exitCode: 5, message: `Failed to load renderer from ${rendererPath}: ${stripAnsi(msg)}` };
  }

  const m = mod as Record<string, unknown>;
  if (typeof m.render !== 'function') {
    if (!('render' in m)) {
      throw { exitCode: 5, message: `Renderer module at ${rendererPath} does not export a "render" function` };
    }
    throw { exitCode: 5, message: `Renderer module at ${rendererPath}: "render" export is not a function` };
  }

  let result: unknown;
  try {
    result = m.render(graph);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw { exitCode: 5, message: `Renderer render() threw: ${stripAnsi(msg)}` };
  }

  if (result === null || result === undefined) {
    throw { exitCode: 5, message: `Renderer render() returned ${result === null ? 'null' : 'undefined'}; expected a non-empty value` };
  }

  return String(result);
}

function main(): void {
  const program = new Command();
  const rulesPaths: string[] = [];

  program
    .name('cdk-frosty')
    .description('Visualize AWS CDK architecture from tree.json')
    .argument('<input>', 'Path to CDK tree.json file')
    .option('--output <path>', 'Output HTML file path')
    .option('--rules <path>', 'Additional rules file (repeatable)')
    .option('--stack <pattern>', 'Only include stacks whose name contains this pattern (case-insensitive)')
    .option('--renderer <path>', 'Path to external renderer module (must export a render function)')
    .on('option:rules', (value: string) => { rulesPaths.push(value); })
    .action((input: string, options: { output?: string; stack?: string; renderer?: string }) => {
      const outputPath = options.output
        ? options.output
        : path.join(
            path.dirname(input),
            path.basename(input, path.extname(input)) + '.html'
          );

      try {
        const tree = parse(input);
        const rules = loadRules(rulesPaths, options.stack);
        const graph = execute(tree, rules);
        let output: string;
        if (options.renderer) {
          const rendererPath = path.resolve(options.renderer);
          output = loadRenderer(rendererPath, graph);
        } else {
          output = render(graph);
        }
        fs.writeFileSync(outputPath, output);
        process.stdout.write(`Architecture diagram written to: ${path.resolve(outputPath)}\n`);
      } catch (err) {
        if (err && typeof err === 'object' && 'exitCode' in err) {
          const typed = err as { exitCode: number; message: string };
          const msg = stripAnsi(typed.message ?? String(err));
          process.stderr.write(`Error [${typed.exitCode}]: ${msg}\n`);
          process.exit(typed.exitCode);
        }
        const msg = stripAnsi(err instanceof Error ? err.message : String(err));
        process.stderr.write(`Error [4]: ${msg}\n`);
        process.exit(4);
      }
    });

  program.exitOverride((err) => {
    // commander calls this on --help, --version, and missing required args
    if (err.code === 'commander.helpDisplayed') process.exit(0);
    process.exit(1);
  });

  program.parse(process.argv);

  // If no args provided, commander will not invoke action — print help
  if (process.argv.length <= 2) {
    program.help();
  }
}

main();
