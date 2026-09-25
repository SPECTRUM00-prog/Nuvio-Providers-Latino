/**
 * Extractor de todos los servidores (KeKi, Flix, Magi, etc.) y Series en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITORÍA PROFUNDA DE SERVIDORES Y SERIES");
console.log("==================================================\n");

// 1. Extraer los 6 servidores de la película 'ayuda'
console.log("[1] Consultando película 'ayuda'...");
fetch(BASE_URL + "/movies/ayuda", { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        var idMatch = html.match(/"movieId"\s*:\s*"([a-zA-Z0-9]+)"/i) || html.match(/"id"\s*:\s*"([a-zA-Z0-9]+)"/i);
        var movieId = idMatch ? idMatch[1] : null;

        console.log("-> Movie ID detectado en 'ayuda':", movieId);
        if (!movieId) return;

        var streamApi = BASE_URL + "/api/movies/" + movieId + "/stream";
        console.log("-> Consultando API de streams:", streamApi);

        return fetch(streamApi, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/movies/ayuda" } })
            .then(function(r) { return r.json(); })
            .then(function(json) {
                console.log("\n[+] LISTA COMPLETA DE SERVIDORES ENCONTRADOS (" + (json.links ? json.links.length : 0) + "):");
                var links = json.links || [];
                for (var i = 0; i < links.length; i++) {
                    var l = links[i];
                    console.log("   [" + (i + 1) + "] Botón: " + l.server + " | Servidor real: " + l.name + " (" + l.language + ") -> " + l.url);
                }
            });
    })
    .then(function() {
        // 2. Probar cómo maneja una Serie en PelisGO
        console.log("\n[2] Probando una serie en PelisGO (Breaking Bad / Fallout)...");
        return fetch(BASE_URL + "/search?q=Breaking%20Bad", { headers: headers });
    })
    .then(function(res) { return res.text(); })
    .then(function(searchHtml) {
        var seriesLinkMatch = searchHtml.match(/href=["'](\/series\/[^"']+)["']/i);
        var seriesPath = seriesLinkMatch ? seriesLinkMatch[1] : "/series/breaking-bad";

        console.log("-> Ruta de la serie detectada:", seriesPath);
        return fetch(BASE_URL + seriesPath, { headers: headers })
            .then(function(r) { return r.text(); })
            .then(function(sHtml) {
                console.log("-> Tamaño HTML de la serie:", sHtml.length);

                // Buscar cómo referencia episodios o llamadas API de series
                var seriesId = sHtml.match(/"seriesId"\s*:\s*"([a-zA-Z0-9]+)"/i) || sHtml.match(/"tvId"\s*:\s*"([a-zA-Z0-9]+)"/i) || sHtml.match(/"id"\s*:\s*"([a-zA-Z0-9]+)"/i);
                console.log("[+] ID de la serie:", seriesId ? seriesId[1] : "No encontrado");

                var epMatches = sHtml.match(/\/api\/[^"'\s<>]+/gi) || [];
                console.log("[+] Rutas API en la serie:", [...new Set(epMatches)]);

                var epProps = sHtml.match(/ClientEpisode[^\]]*\]/i) || sHtml.match(/ClientPlayer[^\]]*\]/i);
                if (epProps) {
                    console.log("[+] Componente de reproductor de episodios detectado:", epProps[0].substring(0, 150));
                }
            });
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
