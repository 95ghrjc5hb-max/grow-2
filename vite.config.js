import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // .env ebong .env.local file theke variable load korbe
  const env = loadEnv(mode, process.cwd(), '');

  // Kono URL hardcode chara shorashori env variable theke origin extract korbe
  const rawUrl = env.VITE_API_URL || env.VITE_API_BASE_URL;
  const targetUrl = rawUrl ? new URL(rawUrl).origin : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: targetUrl
        ? {
            '/api': {
              target: targetUrl,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
    },
  };
});