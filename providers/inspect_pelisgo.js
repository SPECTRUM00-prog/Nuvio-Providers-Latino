/**
 * Rastreador del endpoint de video del episodio
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Buscando la llamada de stream en el episodio...");

fetch(EPISODE_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/series/breaking-bad"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Buscar cualquier mención de stream en las rutas de API
    var streamMatches = html.match(/[^"'`\s<>]{0,40}\/api\/[^"'`\s<>]{0,50}/gi) || [];
    console.log("[1] Rutas /api/ encontradas en el episodio:");
    console.log([...new Set(streamMatches)]);

    // 2. Buscar bloques donde aparezca la palabra 'stream'
    var pos = html.indexOf("/stream");
    if (pos !== -1) {
        console.log("\n[+] ¡'/stream' encontrado en posición " + pos + "!");
        console.log("--- FRAGMENTO ALREDEDOR DE /stream ---");
        console.log(html.substring(Math.max(0, pos - 150), pos + 150));
        console.log("--------------------------------------");
    } else {
        console.log("\n[-] No se encontró la cadena literal '/stream' en el HTML.");
    }

    // 3. Probar variantes comunes en singular y query params con el ID
    var testId = "cmm5jyrt3000112uxtugdgoh3";
    var variants = [
        BASE_URL + "/api/episode/" + testId + "/stream",
        BASE_URL + "/api/stream?id=" + testId,
        BASE_URL + "/api/stream?episodeId=" + testId,
        BASE_URL + "/api/stream/" + testId,
        BASE_URL + "/api/episodes/" + testId,
        BASE_URL + "/api/episode/" + testId
    ];

    console.log("\n[*] Probando variantes de endpoint...");

    function tryNext(idx) {
        if (idx >= variants.length) {
            console.log("[-] Fin de variantes directas.");
            return;
        }

        var u = variants[idx];
        return fetch(u, {
            headers: { "User-Agent": USER_AGENT, "Referer": EPISODE_URL }
        })
        .then(function(r) {
            console.log("   -> Probando [" + r.status + "]: " + u);
            if (r.status === 200) {
                return r.text().then(function(t) {
                    console.log("\n[!!!] ¡ENDPOINT ENCONTRADO! [!!!]");
                    console.log(t.substring(0, 400));
                });
            } else {
                return tryNext(idx + 1);
            }
        })
        .catch(function() {
            return tryNext(idx + 1);
        });
    }

    return tryNext(0);
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
