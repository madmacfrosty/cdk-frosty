import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { parse } from './parser';
import { loadRules } from './rules/registry';
import { execute } from './engine';
import { render } from './renderer';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
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
    .on('option:rules', (value: string) => { rulesPaths.push(value); })
    .action((input: string, options: { output?: string; stack?: string }) => {
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
        const html = render(graph);
        fs.writeFileSync(outputPath, html);
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
