/**
 * Escáner de la API de Filemoon (Byse Frontend)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BUNDLE_URL = "https://filemoon.sx/assets/index-DocunfmE.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Descargando y analizando el bundle de Filemoon:", BUNDLE_URL);

fetch(BUNDLE_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://filemoon.sx/"
    }
})
.then(function(res) { return res.text(); })
.then(function(code) {
    console.log("-> Tamaño del bundle recibido:", code.length, "caracteres.\n");

    // 1. Buscar dominios de API (como api.byse.sx o filemoon)
    var domains = code.match(/https?:\/\/[a-zA-Z0-9.-]*(?:byse|filemoon|stream|api)[a-zA-Z0-9.-]*/gi) || [];
    var uniqueDomains = [];
    for (var d = 0; d < domains.length; d++) {
        if (uniqueDomains.indexOf(domains[d]) === -1) uniqueDomains.push(domains[d]);
    }
    console.log("[1] Dominios de API y plataformas detectados:");
    console.log(uniqueDomains);

    // 2. Buscar rutas relativas de API
    var apiRoutes = code.match(/["'`](\/(?:api|v[0-9]|player|video|embed)[^"'`\s<>]+)["'`]/gi) || [];
    var uniqueApis = [];
    for (var a = 0; a < apiRoutes.length; a++) {
        var clean = apiRoutes[a].replace(/["'`]/g, "");
        if (uniqueApis.indexOf(clean) === -1) uniqueApis.push(clean);
    }
    console.log("\n[2] Rutas de API relativas encontradas:");
    console.log(uniqueApis);

    // 3. Buscar llamadas fetch o axios en el código
    var fetchSnippets = code.match(/fetch\(["'`][^"'`]+["'`]/gi) || [];
    console.log("\n[3] Llamadas fetch directas:");
    console.log(fetchSnippets);

    // 4. Buscar palabras clave como 'filecode', 'm3u8', 'sources'
    var keywords = ["filecode", "sources", "hls", ".m3u8"];
    console.log("\n[4] Rastreo de palabras clave:");
    keywords.forEach(function(k) {
        var pos = code.indexOf(k);
        if (pos !== -1) {
            console.log("-> Clave '" + k + "' encontrada en pos " + pos + ":");
            console.log("   " + code.substring(Math.max(0, pos - 60), pos + 120).replace(/\n/g, " "));
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
