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
  const vendorPath = path.resolve(__dirname, '..', '..', 'vendor', 'mermaid.min.js');
  const mermaidJs = fs.readFileSync(vendorPath, 'utf8');
  const escaped = htmlEscape(mermaidSyntax);

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
<script>mermaid.initialize({startOnLoad:true,theme:'default'});</script>
</body>
</html>`;
}
