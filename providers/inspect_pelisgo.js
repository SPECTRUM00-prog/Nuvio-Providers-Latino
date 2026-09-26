/**
 * Extractor exacto de episodeId y llamada a /stream en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Buscando la propiedad episodeId en el HTML...");

fetch(EPISODE_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/series/breaking-bad"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer el valor de episodeId
    var match = html.match(/\\?"episodeId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i);
    var episodeId = match ? match[1] : null;

    console.log("[+] episodeId encontrado:", episodeId);

    if (!episodeId) {
        // En caso de que esté con formato de objeto JS en bloque
        var fallbackMatch = html.match(/episodeId\s*:\s*["']([^"']+)["']/i);
        if (fallbackMatch) episodeId = fallbackMatch[1];
        console.log("[i] Intento fallback de episodeId:", episodeId);
    }

    if (!episodeId) {
        console.log("[-] No se pudo aislar episodeId.");
        return;
    }

    // 2. Consultar el endpoint oficial de video del episodio
    var streamUrl = BASE_URL + "/api/series/episode/" + episodeId + "/stream";
    console.log("\n[*] Consultando endpoint:", streamUrl);

    return fetch(streamUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Referer": EPISODE_URL
        }
    })
    .then(function(r) { return r.json(); })
    .then(function(json) {
        console.log("\n=======================================================");
        console.log("[✓] ¡REPRODUCTOR DEL EPISODIO EXTRAÍDO CON ÉXITO!");
        console.log("    Total enlaces:", (json.links ? json.links.length : 0));
        console.log("=======================================================");
        console.log(JSON.stringify(json, null, 2).substring(0, 1000));
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
