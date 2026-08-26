const express = require("express");
const { getRouter, landingTemplate } = require("stremio-addon-sdk");
const addonInterface = require("../addon.js");

const app = express();
const router = getRouter(addonInterface);

// Renderizar la página oficial de bienvenida con el botón de Instalar en /
app.get("/", (req, res) => {
    const landingHTML = landingTemplate(addonInterface.manifest);
    res.setHeader("content-type", "text/html");
    res.end(landingHTML);
});

app.use(router);

module.exports = app;
