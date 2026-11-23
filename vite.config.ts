import { defineConfig, Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { VitePWA } from 'vite-plugin-pwa';
import { createProxyHandler } from './server/proxy.mjs';

const appVersion: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
).version;

const appName: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'app.config.json'), 'utf-8'),
).appName;

// Vite's SPA fallback would otherwise serve the app at this extensionless URL.
function servePrivacyPage(server: Pick<ViteDevServer, 'middlewares'>, directory: string) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] !== '/privacypolicy') return next();
    const file = path.join(directory, 'privacypolicy.html');
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.end('Privacy policy not found.');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(fs.readFileSync(file, 'utf-8'));
  });
}

// index.html and public/privacy.html carry %APP_NAME% where the app name belongs.
function appNamePlugin(): Plugin {
  const fill = (html: string) => html.replaceAll('%APP_NAME%', appName);
  let outDir = 'dist';
  return {
    name: 'app-name',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: fill,
    configureServer(server) {
      servePrivacyPage(server, path.resolve(__dirname, 'public'));
      server.middlewares.use('/privacy.html', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fill(fs.readFileSync(path.resolve(__dirname, 'public/privacy.html'), 'utf-8')));
      });
    },
    configurePreviewServer(server) {
      servePrivacyPage(server, outDir);
    },
    // Runs before the PWA plugin lists the files, so the precache hash matches the final content.
    writeBundle() {
      const file = path.join(outDir, 'privacy.html');
      if (fs.existsSync(file)) fs.writeFileSync(file, fill(fs.readFileSync(file, 'utf-8')));
      fs.copyFileSync(path.resolve(__dirname, 'LICENSE'), path.join(outDir, 'license.txt'));
      fs.copyFileSync(path.resolve(__dirname, 'NOTICE'), path.join(outDir, 'notice.txt'));
    },
  };
}

// main.tsx can only import App after the native token load, so the browser would
// otherwise download and compile it strictly after that. Preloading lets that
// work overlap with the token load.
function preloadAppChunkPlugin(): Plugin {
  return {
    name: 'preload-app-chunk',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const app = Object.values(bundle).find(
          (c) => c.type === 'chunk' && Object.keys(c.modules).some((id) => id.endsWith('/src/App.tsx')),
        );
        if (!app || app.type !== 'chunk') return;
        const files = new Set<string>();
        const visit = (name: string) => {
          if (files.has(name)) return;
          files.add(name);
          const chunk = bundle[name];
          if (chunk?.type === 'chunk') chunk.imports.forEach(visit);
        };
        visit(app.fileName);
        return [...files].map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file}` },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

function bakalariProxyPlugin(): Plugin {
  return {
    name: 'bakalari-proxy',
    configureServer(server) {
      const proxy = createProxyHandler();
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api-proxy/') || req.url?.startsWith('/api-sluzby/') || req.url?.startsWith('/api-school/')) {
          void proxy(req, res);
        } else next();
      });
    },
  };
}

function preventHmrReloadPlugin(): Plugin {
  return {
    name: 'prevent-hmr-reload',
    transform(code, id) {
      if (id.includes('/vite/dist/client/client.mjs') || id.includes('@vite/client')) {
        return code.replace(
          /if\s*\(\s*payload\.event\s*===\s*["']vite:ws:disconnect["']\s*\)\s*\{[\s\S]*?location\.reload\(\);[\s\S]*?\}\s*\}/,
          `if (payload.event === "vite:ws:disconnect") {
            console.log("[vite] server connection resumed (auto-reload on disconnect suppressed for mobile testing).");
          }`
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    appNamePlugin(),
    preloadAppChunkPlugin(),
    bakalariProxyPlugin(),
    preventHmrReloadPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: appName,
        short_name: appName,
        description: 'Moderní Bakaláři klient',
        lang: 'cs',
        theme_color: '#0e1417',
        background_color: '#0e1417',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png?v=3',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png?v=3',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-512.png?v=3',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,txt}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api-proxy/, /^\/api-sluzby/, /^\/api-school/, /^\/privacy\.html$/, /^\/privacypolicy(?:\.html)?$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
});
