# CLAUDE.md

## Project Overview
cdk-frosty is a CLI tool that visualizes AWS CDK software architecture from a `tree.json` file (produced by `cdk synth`). It transforms the CDK construct tree into a meaningful architecture diagram by applying rules that map CDK nodes to architecture containers and edges, then renders the result as an HTML file with an embedded Mermaid diagram.

## Tech Stack
- TypeScript / Node.js
- Mermaid (for diagram rendering, embedded in HTML output)
- No framework — plain CLI

## Project Structure
- `src/` — TypeScript source
- `dist/` — compiled output
- `.claude/pdd/` — PDD artifacts (requirements, design, tasks)

## Coding Conventions
- TypeScript strict mode
- Functional style preferred over classes where practical
- No over-engineering: solve the current task, not hypothetical future ones
- Keep modules small and focused

## Testing Approach
- Unit tests for the transformation logic (rules engine, graph model)
- Not required for the renderer initially

## Key Commands
- `npm run build` — compile TypeScript
- `npm run dev` — run with ts-node
- `npm test` — run tests

## Important Constraints
- Do not add features beyond what is required
- Do not add comments unless logic is non-obvious
- The architecture graph is a new structure — not a filtered view of the CDK tree
- Rules drive everything: node classification, edge derivation, grouping
