import { Rule } from '../../engine/types';

export function stackFilter(pattern: string): Rule {
  const lower = pattern.toLowerCase();
  return {
    id: 'filter/stack',
    priority: 100,
    match(node) {
      if (node.path === '') return false;
      const stack = node.path.split('/')[0];
      return !stack.toLowerCase().includes(lower);
    },
    apply() { return null; },
  };
}
