import { defineConfig, build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = resolve(root, 'dist');
const apiBase = process.env.VITE_API_BASE ?? 'http://127.0.0.1:4000';

function writeManifestAndAssets() {
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    manifest_version: 3,
    name: 'Live Translator',
    version: '0.1.0',
    description: 'Real-time translated subtitles for Twitch streams.',
    action: {
      default_popup: 'popup.html',
      default_title: 'Live Translator',
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    permissions: ['activeTab', 'tabCapture', 'offscreen', 'storage'],
    host_permissions: [
      'https://www.twitch.tv/*',
      'https://gql.twitch.tv/*',
      'http://localhost:4000/*',
      'http://127.0.0.1:4000/*',
    ],
    content_scripts: [
      {
        matches: ['https://www.twitch.tv/*'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    web_accessible_resources: [
      {
        resources: ['offscreen.html', 'audio-worklet.js'],
        matches: ['https://www.twitch.tv/*'],
      },
    ],
  };
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const offscreenSrc = resolve(root, 'src/offscreen/offscreen.html');
  if (existsSync(offscreenSrc)) {
    let html = readFileSync(offscreenSrc, 'utf8');
    html = html.replace('./offscreen.ts', './offscreen.js');
    writeFileSync(resolve(outDir, 'offscreen.html'), html);
  }

  mkdirSync(resolve(outDir, 'icons'), { recursive: true });
  const publicIcons = resolve(root, 'public/icons');
  for (const name of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const src = resolve(publicIcons, name);
    if (existsSync(src)) {
      copyFileSync(src, resolve(outDir, 'icons', name));
    }
  }
}

/** Content scripts & worklets must be classic/IIFE — no ES imports. */
async function buildStandaloneScripts() {
  const entries = [
    { name: 'content', entry: resolve(root, 'src/content/index.ts') },
    { name: 'audio-worklet', entry: resolve(root, 'src/offscreen/audio-worklet.ts') },
  ];

  for (const { name, entry } of entries) {
    await viteBuild({
      configFile: false,
      root,
      define: {
        __API_BASE__: JSON.stringify(apiBase),
      },
      build: {
        outDir,
        emptyOutDir: false,
        sourcemap: true,
        target: 'chrome120',
        minify: false,
        lib: {
          entry,
          name: name.replace(/-/g, '_'),
          formats: ['iife'],
          fileName: () => `${name}.js`,
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
            assetFileNames: 'assets/[name][extname]',
          },
        },
      },
      logLevel: 'warn',
    });
  }
}

function extensionBuildPlugin() {
  return {
    name: 'live-translator-extension',
    buildStart() {
      // Ensure content/worklet source edits invalidate the watched build.
      this.addWatchFile(resolve(root, 'src/content'));
      this.addWatchFile(resolve(root, 'src/offscreen/audio-worklet.ts'));
      this.addWatchFile(resolve(root, 'src/offscreen/offscreen.html'));
      this.addWatchFile(resolve(root, 'public'));
    },
    async closeBundle() {
      await buildStandaloneScripts();
      writeManifestAndAssets();
    },
  };
}

export default defineConfig({
  plugins: [react(), extensionBuildPlugin()],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(root, 'popup.html'),
        background: resolve(root, 'src/background/service-worker.ts'),
        offscreen: resolve(root, 'src/offscreen/offscreen.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
    target: 'chrome120',
    minify: false,
  },
  define: {
    __API_BASE__: JSON.stringify(apiBase),
  },
});
