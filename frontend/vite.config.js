import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: import.meta.env.VITE_API_URL,
        changeOrigin: true,
        secure: true
      }
    }
  },
  define : {
    global: {},
  }
  /*
  changed!!! define : {
    global: {},
  }
  */
})
