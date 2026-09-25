/**
 * Extractor de precisión para PelisGO (Películas y Series)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITORÍA DE PRECISIÓN: PelisGO");
console.log("==================================================\n");

// 1. Extraer ID y enlaces de la película 'ayuda'
console.log("[1] Analizando película: https://pelisgo.online/movies/ayuda");

fetch(BASE_URL + "/movies/ayuda", { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // En Next.js serializado viene como: \"movieId\":\"cuid_o_id\"
        var idMatch = html.match(/\\?"movieId\\?"\s*:\s*\\?"([a-zA-Z0-9_-]+)\\?"/i) ||
                      html.match(/\\?"id\\?"\s*:\s*\\?"(cm[a-zA-Z0-9]+)\\?"/i);

        var movieId = idMatch ? idMatch[1] : null;
        console.log("-> Movie ID extraído:", movieId);

        if (movieId) {
            var streamUrl = BASE_URL + "/api/movies/" + movieId + "/stream";
            console.log("-> Consultando API de streams:", streamUrl);

            return fetch(streamUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/movies/ayuda" }
            })
            .then(function(r) { return r.json(); })
            .then(function(json) {
                console.log("\n[+] SERVIDORES DE LA PELÍCULA (" + (json.links ? json.links.length : 0) + "):");
                var links = json.links || [];
                for (var i = 0; i < links.length; i++) {
                    var l = links[i];
                    console.log("   [" + (i + 1) + "] " + l.server + " (" + l.language + " - " + l.quality + ") -> " + l.url);
                }
            });
        }
    })
    .then(function() {
        // 2. Analizar la serie Breaking Bad
        console.log("\n[2] Analizando serie: https://pelisgo.online/series/breaking-bad");
        return fetch(BASE_URL + "/series/breaking-bad", { headers: headers });
    })
    .then(function(res) { return res.text(); })
    .then(function(sHtml) {
        console.log("-> Tamaño HTML recibido:", sHtml.length, "caracteres.");

        // Buscar componentes de episodios o reproductores de series
        var seriesDataMatches = sHtml.match(/\\?"(?:seriesId|episodeId|showId|tvId|seasonId)\\?"\s*:\s*\\?"([a-zA-Z0-9_-]+)\\?"/gi) || [];
        console.log("[+] Identificadores de series detectados:", seriesDataMatches.slice(0, 5));

        // Buscar enlaces a episodios o temporadas en el HTML
        var epLinks = sHtml.match(/href=\\?["'](\/series\/[^"'\\>]+)\\?["']/gi) || [];
        var uniqueEpLinks = [];
        for (var e = 0; e < epLinks.length; e++) {
            var cleanHref = epLinks[e].replace(/href=\\?["']|\\?["']/gi, "");
            if (cleanHref !== "/series/breaking-bad" && uniqueEpLinks.indexOf(cleanHref) === -1) {
                uniqueEpLinks.push(cleanHref);
            }
        }
        console.log("[+] Enlaces internos de episodios detectados (" + uniqueEpLinks.length + "):");
        console.log(uniqueEpLinks.slice(0, 5));

        // Buscar llamadas API de episodios en los chunks o bloques
        var apiEpMatches = sHtml.match(/\/api\/(?:series|episodes|tv)[^"'\s<>\\]+/gi) || [];
        console.log("[+] Endpoints API de series en el HTML:", [...new Set(apiEpMatches)]);
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
