import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const prod = process.argv.includes('--production');

const common = { bundle: true, sourcemap: !prod, minify: prod, logLevel: 'info' };

const contexts = await Promise.all([
  // Extension host. The Agent SDK stays external: it is ESM-only and resolves a
  // platform-specific native binary from its optional dependencies at runtime.
  esbuild.context({
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode', '@anthropic-ai/claude-agent-sdk'],
  }),
  // Webviews. ESM + splitting keeps Mermaid (several MB) in a lazily loaded chunk.
  esbuild.context({
    ...common,
    entryPoints: { sidebar: 'src/webview/sidebar.tsx', runPanel: 'src/webview/runPanel.tsx' },
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    target: 'es2022',
  }),
]);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
}
