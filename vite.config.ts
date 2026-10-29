import { defineConfig, type Plugin } from 'vite';

/**
 * Bettet JS und CSS direkt in dist/index.html ein. So läuft das Spiel auch
 * per Doppelklick (file://), wo Browser externe Module blockieren.
 */
function singleFile(): Plugin {
  return {
    name: 'netbreach-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        const ref = new RegExp(`<script[^>]*src="[^"]*${escapeRe(file.fileName)}"[^>]*></script>`);
        const css = new RegExp(`<link[^>]*href="[^"]*${escapeRe(file.fileName)}"[^>]*>`);
        if (file.type === 'chunk' && ref.test(source)) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          source = source.replace(ref, () => `<script type="module">\n${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && file.fileName.endsWith('.css') && css.test(source)) {
          source = source.replace(css, () => `<style>\n${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  base: './',
  plugins: [singleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
