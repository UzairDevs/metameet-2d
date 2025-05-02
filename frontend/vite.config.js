import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default ({ mode }) => {
  // Load env variables based on mode (dev/prod)
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return defineConfig({
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/socket.io': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          ws: true,
          changeOrigin: true
        }
      }
    },
    define: {
      global: 'window'  // Fixed global definition
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: true
    }
  });
};