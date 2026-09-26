/**
 * Extractor del reproductor de episodios en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": "https://pelisgo.online/series/breaking-bad"
};

console.log("==================================================");
console.log("[*] INSPECCIONANDO EPISODIO EN PELISGO");
console.log("    URL: " + EPISODE_URL);
console.log("==================================================\n");

fetch(EPISODE_URL, { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        console.log("-> Tamaño HTML recibido:", html.length, "caracteres.\n");

        // 1. Buscar cualquier ID de cuid (cm...) asociado al episodio
        var idMatches = html.match(/\\?"(?:episodeId|id|movieId)\\?"\s*:\s*\\?"(cm[a-zA-Z0-9]+)\\?"/gi) || [];
        console.log("[1] IDs de episodio detectados:", idMatches.slice(0, 5));

        // 2. Extraer el primer ID limpio
        var episodeId = null;
        var cleanMatch = html.match(/\\?"(?:episodeId|id)\\?"\s*:\s*\\?"(cm[a-zA-Z0-9]+)\\?"/i);
        if (cleanMatch) {
            episodeId = cleanMatch[1];
        }

        console.log("\n[2] ID extraído:", episodeId);

        // 3. Probar los posibles endpoints de stream para el episodio
        if (episodeId) {
            var testEndpoints = [
                BASE_URL + "/api/episodes/" + episodeId + "/stream",
                BASE_URL + "/api/movies/" + episodeId + "/stream",
                BASE_URL + "/api/series/episodes/" + episodeId + "/stream"
            ];

            console.log("\n[3] Probando endpoints de stream con el ID...");

            function tryNext(idx) {
                if (idx >= testEndpoints.length) {
                    console.log("[-] Fin de las pruebas de endpoint.");
                    return;
                }
                var target = testEndpoints[idx];
                return fetch(target, {
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Accept": "application/json",
                        "Referer": EPISODE_URL
                    }
                })
                .then(function(r) {
                    console.log("   -> Probando [" + r.status + "]: " + target);
                    if (r.status === 200) {
                        return r.json().then(function(json) {
                            console.log("\n[!!!] ¡ENDPOINT DE EPISODIO VÁLIDO! [!!!]");
                            console.log("[+] Servidores encontrados (" + (json.links ? json.links.length : 0) + "):");
                            var links = json.links || [];
                            for (var i = 0; i < links.length; i++) {
                                var l = links[i];
                                console.log("   [" + (i + 1) + "] " + l.server + " (" + l.language + " - " + l.quality + ") -> " + l.url);
                            }
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
        } else {
            console.log("[-] No se pudo aislar el episodeId en este bloque.");
        }
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
