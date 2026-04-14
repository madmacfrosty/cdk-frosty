import * as fs from 'fs';
import * as path from 'path';

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapInHtml(mermaidSyntax: string): string {
  const vendorDir = path.resolve(__dirname, '..', '..', 'vendor');
  const mermaidJs = fs.readFileSync(path.join(vendorDir, 'mermaid.min.js'), 'utf8');
  const elkChunk = fs.readFileSync(path.join(vendorDir, 'elk-chunk.mjs'), 'utf8');
  const elkRender = fs.readFileSync(path.join(vendorDir, 'elk-render.mjs'), 'utf8');
  const elkMain = fs.readFileSync(path.join(vendorDir, 'elk-main.mjs'), 'utf8');
  const escaped = htmlEscape(mermaidSyntax);

  // Safely embed ELK module content as JS string literals (handles backticks/backslashes)
  const elkChunkJson = JSON.stringify(elkChunk);
  const elkRenderJson = JSON.stringify(elkRender);
  // elk-main imports from relative paths; those get patched at runtime to blob URLs
  const elkMainJson = JSON.stringify(elkMain);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CDK Architecture</title>
<style>
  body { font-family: sans-serif; margin: 2rem; background: #fafafa; }
  .mermaid { background: white; padding: 1rem; border-radius: 4px; }
</style>
</head>
<body>
<pre class="mermaid">${escaped}</pre>
<script>${mermaidJs}</script>
<script>mermaid.initialize({startOnLoad: false});</script>
<script type="module">
// Inline ELK layout via blob URLs so the HTML stays self-contained.
// We disable startOnLoad above and call mermaid.run() here after ELK is registered,
// because <script type="module"> is deferred and DOMContentLoaded fires before it runs.
const mime = 'application/javascript';
const chunkUrl = URL.createObjectURL(new Blob([${elkChunkJson}], {type: mime}));
const renderSrc = ${elkRenderJson}.replace('./chunk-SP2CHFBE.mjs', chunkUrl);
const renderUrl = URL.createObjectURL(new Blob([renderSrc], {type: mime}));
const mainSrc = ${elkMainJson}
  .replace('./chunks/mermaid-layout-elk.esm.min/chunk-SP2CHFBE.mjs', chunkUrl)
  .replace('"./chunks/mermaid-layout-elk.esm.min/render-T6MDALS3.mjs"', JSON.stringify(renderUrl));
const mainUrl = URL.createObjectURL(new Blob([mainSrc], {type: mime}));
const {default: elkLayouts} = await import(mainUrl);
mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({startOnLoad: false, theme: 'default', layout: 'elk'});
await mermaid.run();
</script>
</body>
</html>`;
}
