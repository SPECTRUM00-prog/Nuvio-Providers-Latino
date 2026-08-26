const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon.js");

const router = getRouter(addonInterface);

module.exports = (req, res) => {
    // Restaurar la ruta original que solicitó Stremio o el navegador
    if (req.headers["x-matched-path"]) {
        req.url = req.headers["x-matched-path"];
    } else if (req.url && req.url.startsWith("/api")) {
        req.url = req.url.replace(/^\/api(?:\/index(?:\.js)?)?/, "") || "/";
    }

    if (!req.url.startsWith("/")) {
        req.url = "/" + req.url;
    }

    router(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
    });
};
