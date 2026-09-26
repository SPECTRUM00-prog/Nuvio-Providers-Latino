/**
 * Escáner universal de todas las rutas /api/ en los chunks de PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] 1. Descargando página del episodio para extraer sus chunks JS...");

fetch(EPISODE_URL, {
    headers: { "User-Agent": USER_AGENT, "Referer": "https://pelisgo.online/series/breaking-bad" }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer todos los chunks .js de la página
    var chunkRegex = /src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/gi;
    var chunks = [];
    var m;
    while ((m = chunkRegex.exec(html)) !== null) {
        if (chunks.indexOf(m[1]) === -1) chunks.push(m[1]);
    }

    console.log("[+] Chunks detectados en el episodio (" + chunks.length + ")");
    console.log("\n[*] 2. Escaneando cada chunk en busca de endpoints /api/ y llamadas de video...\n");

    var allApiRoutes = [];

    var downloadPromises = chunks.map(function(cPath) {
        var fullChunkUrl = BASE_URL + cPath;
        return fetch(fullChunkUrl, { headers: { "User-Agent": USER_AGENT } })
            .then(function(r) { return r.text(); })
            .then(function(code) {
                // Buscar cualquier cosa que empiece por /api/
                var matches = code.match(/["'`](\/api\/[^"'`\s<>]+)["'`]/gi) || [];
                for (var i = 0; i < matches.length; i++) {
                    var clean = matches[i].replace(/["'`]/g, "");
                    if (allApiRoutes.indexOf(clean) === -1) allApiRoutes.push(clean);
                }

                // Buscar plantillas de fetch con template strings `.../stream`
                var streamTemplates = code.match(/`[^`]*\/stream[^`]*`/gi) || [];
                if (streamTemplates.length > 0) {
                    console.log("   [!] Plantilla de stream encontrada en " + cPath + ":");
                    console.log("       ->", streamTemplates);
                }
            })
            .catch(function() {});
    });

    return Promise.all(downloadPromises).then(function() {
        console.log("\n==================================================");
        console.log("[+] TODAS LAS RUTAS /api/ DETECTADAS EN PELISGO:");
        console.log("==================================================");
        console.log(allApiRoutes);
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
