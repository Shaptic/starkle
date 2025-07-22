import { defineConfig } from 'vite'

import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  // base: "/static",
  plugins: [
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__tla",
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: i => `__tla_${i}`
    })
  ],
  // build: {
  //   rollupOptions: {
  //     input: {
  //       main: './src/main.js',
  //       login: './src/login.js',
  //     },
  //     external: ['@stellar/stellar-sdk', '@stellar/freighter-api', 'jquery'],
  //   },
  // },
});
