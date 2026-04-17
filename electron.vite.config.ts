import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [
      // Externalize all deps EXCEPT pure-ESM ones that must be inlined for CJS main.
      // electron-store@10 is ESM-only and cannot be `require`'d from a CJS bundle.
      externalizeDepsPlugin({ exclude: ['electron-store'] })
    ],
    build: {
      rollupOptions: {
        // Ensure esm deps we inline are resolved correctly.
        output: { format: 'cjs' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
