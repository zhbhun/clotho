// Compile-time constant that @electron-forge/plugin-vite injects into the
// main-process bundle via Vite `define` (the plugin declares the same globals
// in its forge-vite-env.d.ts). It is only defined when the app is started
// through the plugin's dev server; packaged builds leave it undefined.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
