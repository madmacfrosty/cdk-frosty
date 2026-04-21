# PDD State — renderer-plugin

## Idea
Make cdk-frosty renderer-agnostic by introducing a pluggable `Renderer<T>` interface, so external renderers can be dropped in without cdk-frosty knowing about them.

## Context
- Source: conversation
- Key constraint: cdk-frosty must NOT know about any specific downstream renderer

## Design Decisions
- Add `export interface Renderer<T = unknown> { render(graph: ArchGraph): T }` in `src/renderer/types.ts`
- Mermaid renderer becomes the default implementation of `Renderer<string>`
- CLI gets `--renderer <path>` flag (same dynamic-load pattern as `--rules`)
- Add `origin: ContainerOrigin` (mandatory enum: `'synthesized' | 'imported' | 'synthetic'`) to `ArchContainer` — inferred by graph-builder from CDK node shape, never set by rules
- Add `style?: string` to `ArchEdge` — rendering hint (e.g. `dashed`, `orthogonal`)
- `metadata: Record<string, unknown>` on both types remains the extension point for renderer-specific data

## Track
Tasks Only

## Phase
- [x] Ideation
- [x] Tasks
- [x] Implement
