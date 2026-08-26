const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon.js");

const PORT = process.env.PORT || 7000;

serveHTTP(addonInterface, { port: PORT });
console.log(`\n🚀 Addon de Stremio corriendo localmente en: http://localhost:${PORT}/manifest.json`);
