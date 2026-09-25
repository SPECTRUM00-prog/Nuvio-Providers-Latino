/**
 * Extractor de reproductores y datos de Next.js en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TARGET_URL = "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://pelisgo.online/"
};

console.log("==================================================");
console.log("[*] INSPECCIONANDO REPRODUCTOR EN: " + TARGET_URL);
console.log("==================================================\n");

fetch(TARGET_URL, { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        console.log("-> HTML recibido:", html.length, "caracteres.\n");

        // 1. Buscar enlaces con texto como 'Reproducir', 'Ver', 'Play', 'Watch'
        console.log("[1] Analizando botones o enlaces de reproducción:");
        var playBtnMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?(?:Reproducir|Ver|Play|Watch)[\s\S]*?<\/a>/gi) || [];
        for (var b = 0; b < playBtnMatches.length; b++) {
            console.log("   ->", playBtnMatches[b]);
        }
        if (playBtnMatches.length === 0) console.log("   No hay etiquetas <a> obvias de reproducción.");

        // 2. Buscar rutas /api/ dentro de los scripts empotrados
        console.log("\n[2] Rutas de API mencionadas en la página:");
        var apiRegex = /["'](\/api\/[^"'\s<>]+)["']/gi;
        var apis = [];
        var am;
        while ((am = apiRegex.exec(html)) !== null) {
            if (apis.indexOf(am[1]) === -1) apis.push(am[1]);
        }
        console.log(apis.length > 0 ? apis : "   Ninguna ruta /api/ directa.");

        // 3. Buscar URLs absolutas que parezcan servidores de video o embeds
        console.log("\n[3] Dominios externos y embeds en el código:");
        var extRegex = /https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,8}(?:\/[^"'\s<>\\]*)?/gi;
        var extUrls = [];
        var em;
        while ((em = extRegex.exec(html)) !== null) {
            var u = em[0];
            if (u.indexOf("w3.org") === -1 && 
                u.indexOf("google") === -1 && 
                u.indexOf("pelisgo.online") === -1 && 
                u.indexOf("schema.org") === -1) {
                if (extUrls.indexOf(u) === -1) extUrls.push(u);
            }
        }
        console.log(extUrls.slice(0, 10));

        // 4. Buscar cadenas que contengan 'servers', 'player', 'embed', 'sources', 'stream'
        console.log("\n[4] Claves de reproductor en bloques React (self.__next_f):");
        var playerMatches = html.match(/[^"'{}[\]]{0,30}(?:servers|player|embeds|stream_url|video_url|sources|fileCode)[^"'{}[\]]{0,60}/gi) || [];
        var uniqueKeys = [];
        for (var k = 0; k < playerMatches.length; k++) {
            var cleanKey = playerMatches[k].trim();
            if (uniqueKeys.indexOf(cleanKey) === -1) uniqueKeys.push(cleanKey);
        }
        console.log(uniqueKeys.slice(0, 10));

        // 5. Buscar posibles cadenas en Base64 largas (típicas de tokens de video)
        console.log("\n[5] Posibles tokens en Base64 empotrados:");
        var b64Matches = html.match(/["'](aHR0cHM6[a-zA-Z0-9+/=_-]{30,})["']/gi) || [];
        console.log(b64Matches.slice(0, 5));
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
