import * as fs from 'fs';
import * as path from 'path';
import { wrapInHtml } from './template';
import { render } from './index';
import { ArchGraph } from '../graph/types';

const vendorPath = path.resolve(__dirname, '..', '..', 'vendor', 'mermaid.min.js');
const vendorContent = fs.readFileSync(vendorPath, 'utf8');

function minimalGraph(): ArchGraph {
  const containers = new Map();
  containers.set('Stack_Fn', {
    id: 'Stack_Fn', label: 'Fn', containerType: 'lambda', cdkPath: 'Stack/Fn', metadata: {},
  });
  return { containers, edges: [], roots: ['Stack_Fn'] };
}

describe('wrapInHtml', () => {
  // Test 1: HTML-escaped Mermaid syntax in <pre class="mermaid">
  it('output contains <pre class="mermaid"> with HTML-escaped syntax', () => {
    const html = wrapInHtml('flowchart TD\n  A["Test & <B>"]');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;B&gt;');
  });

  // Test 2: inlined Mermaid JS — verify by checking a known string from the vendor file
  it('output contains inlined Mermaid JS (vendor content present)', () => {
    const html = wrapInHtml('flowchart TD');
    // Check that a distinctive substring of the vendored JS is present
    const distinctive = vendorContent.slice(0, 100);
    expect(html).toContain(distinctive);
  });

  // Test 3: no external script/link tags in the HTML template (CDN-free)
  it('output contains no <script src= or <link href= external tags', () => {
    const html = wrapInHtml('flowchart TD');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link href=');
    // The HTML template section (before the embedded script) should have no CDN URLs
    const preScriptPart = html.split('<script>')[0];
    expect(preScriptPart).not.toMatch(/https?:\/\//);
  });

  // Test 4: </pre> in Mermaid syntax is HTML-escaped
  it('Mermaid syntax containing </pre> is HTML-escaped so pre tag is not broken', () => {
    const html = wrapInHtml('flowchart TD\n</pre>');
    expect(html).toContain('&lt;/pre&gt;');
    // The content between <pre class="mermaid"> and the first </pre> must not contain unescaped </pre>
    const preMatch = html.match(/<pre class="mermaid">([\s\S]*?)<\/pre>/);
    expect(preMatch).not.toBeNull();
    expect(preMatch![1]).not.toContain('</pre>');
  });

  // Test 5: round-trip HTML entity unescape → original Mermaid syntax
  it('round-trip: unescaping HTML entities from <pre> yields original Mermaid syntax', () => {
    const original = 'flowchart TD\n  A["Hello & <World>"]';
    const html = wrapInHtml(original);
    const match = html.match(/<pre class="mermaid">([\s\S]*?)<\/pre>/);
    expect(match).not.toBeNull();
    const escaped = match![1];
    const unescaped = escaped
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    expect(unescaped).toBe(original);
  });

  // Test 6: render() produces non-empty HTML with <pre class="mermaid">
  it('render() with minimal graph: non-empty HTML containing <pre class="mermaid">', () => {
    const html = render(minimalGraph());
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('<pre class="mermaid">');
  });
});
