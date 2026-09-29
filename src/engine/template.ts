/** Render `{{name}}` placeholders. Unknown names render as an empty string. */
export function render(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? '' : String(v);
  });
}
