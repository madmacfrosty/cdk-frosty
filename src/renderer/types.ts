import { ArchGraph } from '../engine/types';

export interface Renderer<T = unknown> {
  render(graph: ArchGraph): T | Promise<T>;
}
