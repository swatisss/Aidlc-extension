import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';

let mermaidReady: Promise<typeof import('mermaid').default> | undefined;
let seq = 0;

function isDarkTheme(): boolean {
  const cls = document.body.classList;
  return cls.contains('vscode-dark') || cls.contains('vscode-high-contrast');
}

/** Lazily load and initialise Mermaid (it's large, and only needed when a diagram appears). */
function loadMermaid() {
  mermaidReady ??= import('mermaid').then(({ default: mermaid }) => {
    // useMaxWidth:false renders diagrams at natural size (CSS caps them at the container width),
    // instead of scaling small diagrams up to fill the panel.
    const natural = { useMaxWidth: false };
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDarkTheme() ? 'dark' : 'default',
      // Plain SVG text instead of HTML-in-foreignObject labels: survives sanitising and sizes correctly.
      htmlLabels: false,
      themeVariables: { fontSize: '13px', fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif' },
      flowchart: natural,
      sequence: natural,
      class: natural,
      state: natural,
      er: natural,
      gantt: natural,
      mindmap: natural,
    });
    return mermaid;
  });
  return mermaidReady;
}

/** Render diagram source to SVG. Returns undefined when the source is invalid. */
export async function renderMermaid(source: string): Promise<string | undefined> {
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`mmd-${++seq}`, source);
    return svg;
  } catch {
    return undefined;
  }
}

/** Replace ```mermaid code blocks inside `root` with rendered diagrams. */
async function renderDiagrams(root: HTMLElement): Promise<void> {
  for (const code of root.querySelectorAll('code.language-mermaid')) {
    const pre = code.parentElement;
    if (!pre || pre.dataset.rendered) continue;
    pre.dataset.rendered = '1';
    const svg = await renderMermaid(code.textContent ?? '');
    if (!svg) {
      pre.classList.add('mermaid-error');
      pre.title = 'Diagram could not be rendered';
      continue;
    }
    const div = document.createElement('div');
    div.className = 'mermaid-diagram';
    div.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] });
    pre.replaceWith(div);
  }
}

export function Markdown({ text, onLink }: { text: string; onLink?: (href: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string), [text]);

  useEffect(() => {
    if (ref.current) void renderDiagrams(ref.current);
  }, [html]);

  return (
    <div
      ref={ref}
      className="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        const href = a?.getAttribute('href');
        if (!href || /^(https?:|mailto:)/.test(href) || href.startsWith('#')) return;
        e.preventDefault();
        onLink?.(href);
      }}
    />
  );
}
