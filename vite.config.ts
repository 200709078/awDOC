import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  // The same output runs on a static web server, in Electron and in the Android WebView.
  base: './',
  // Hakkında penceresindeki sürüm package.json'dan gelir; elle güncellenmez.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    rolldownOptions: {
      output: {
        // The editor engine is its own chunk: the browser cache keeps it when only the app code changes.
        codeSplitting: {
          groups: [{ name: 'editor', test: /node_modules[\\/](@tiptap|prosemirror-)/ }],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
  },
})
