const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon.js");

const app = express();
const router = getRouter(addonInterface);

app.use("/", router);

module.exports = app;
