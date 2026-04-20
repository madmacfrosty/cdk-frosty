import { ArchGraph } from '../engine/types';
import { Renderer } from './types';
import { archGraphToMermaid } from './mermaid';
import { wrapInHtml } from './template';

export function render(graph: ArchGraph): string {
  return wrapInHtml(archGraphToMermaid(graph));
}

export const mermaidRenderer: Renderer<string> = {
  render,
};
