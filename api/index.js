const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon.js");

const app = express();
const router = getRouter(addonInterface);

// Página web de bienvenida con diseño moderno para Stremio
app.get("/", (req, res) => {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "nuvio-providers-latino.vercel.app";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const manifestUrl = `${protocol}://${host}/manifest.json`;
    const stremioDeepLink = `stremio://${host}/manifest.json`;
    const webStremioLink = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spectrum Latino - Stremio Addon</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: radial-gradient(circle at top, #1e1b38 0%, #0d0c1d 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); border-radius: 20px; padding: 40px 30px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .logo { font-size: 50px; margin-bottom: 10px; }
        h1 { font-size: 28px; font-weight: 700; margin-bottom: 10px; background: linear-gradient(135deg, #71ddef 0%, #a855f7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #aaa; font-size: 15px; line-height: 1.6; margin-bottom: 25px; }
        .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-size: 16px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; }
        .btn-install { background: #7c3aed; color: #fff; box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4); }
        .btn-install:hover { background: #6d28d9; transform: translateY(-2px); }
        .btn-web { background: rgba(255,255,255,0.1); color: #ddd; }
        .btn-web:hover { background: rgba(255,255,255,0.2); }
        .footer { font-size: 12px; color: #666; margin-top: 20px; word-break: break-all; }
        .badge { display: inline-block; background: rgba(113, 221, 239, 0.15); color: #71ddef; padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-bottom: 15px; font-weight: 600; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">🌌</div>
        <span class="badge">v1.0.0 · 8 Proveedores Activos</span>
        <h1>Spectrum Latino</h1>
        <p>Películas, Series y Anime en Español Latino, Castellano y Subtitulado en Full HD 1080p y 4K para Stremio.</p>
        <a href="${stremioDeepLink}" class="btn btn-install">🚀 Instalar en Stremio App</a>
        <a href="${webStremioLink}" target="_blank" class="btn btn-web">🌐 Abrir en Stremio Web</a>
        <div class="footer">Manifest URL:<br><code>${manifestUrl}</code></div>
    </div>
</body>
</html>`;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
});

app.use(router);

module.exports = app;
