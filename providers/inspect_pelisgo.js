/**
 * Extractor de la clave exacta del episodio en el reproductor de PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var CHUNK_URL = "https://pelisgo.online/_next/static/chunks/0178590330c372b0.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] 1. Analizando cómo el componente llama a /api/series/episode/...");

fetch(CHUNK_URL, { headers: { "User-Agent": USER_AGENT } })
    .then(function(r) { return r.text(); })
    .then(function(code) {
        var needle = "/api/series/episode/";
        var pos = code.indexOf(needle);
        if (pos !== -1) {
            console.log("\n[+] Fragmento de la llamada en el código compilado:");
            console.log(code.substring(Math.max(0, pos - 150), pos + 250));
        }

        console.log("\n[*] 2. Inspeccionando props del reproductor en la página del episodio...");
        return fetch(EPISODE_URL, { headers: { "User-Agent": USER_AGENT } });
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        // Extraer todas las propiedades que le pasan al componente
        var propsMatch = html.match(/Client[A-Za-z0-9]*Section[^\]]*\]/gi) || [];
        console.log("\n[+] Componentes de sección en el episodio:");
        propsMatch.forEach(function(m) {
            console.log("->", m.substring(0, 180));
        });

        // Buscar todos los IDs tipo cuid (cm...) presentes en la página
        var ids = html.match(/"(cm[a-zA-Z0-9]{20,})"/g) || [];
        var cleanIds = [...new Set(ids.map(function(x) { return x.replace(/"/g, ""); }))];

        console.log("\n[*] 3. Probando los IDs detectados (" + cleanIds.length + ") contra el endpoint de stream...");

        function tryId(idx) {
            if (idx >= cleanIds.length) {
                console.log("[-] Fin de pruebas de IDs.");
                return;
            }
            var testId = cleanIds[idx];
            var testUrl = "https://pelisgo.online/api/series/episode/" + testId + "/stream";
            return fetch(testUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": EPISODE_URL }
            })
            .then(function(res) {
                return res.json().then(function(data) {
                    if (data && data.links && data.links.length > 0) {
                        console.log("\n=======================================================");
                        console.log("[!!!] ¡ID CORRECTO ENCONTRADO!:", testId);
                        console.log("      URL:", testUrl);
                        console.log("      Servidores (" + data.links.length + "):");
                        data.links.forEach(function(l, i) {
                            console.log("      [" + (i + 1) + "] " + l.server + " (" + l.language + ") -> " + l.url);
                        });
                        console.log("=======================================================\n");
                    } else {
                        return tryId(idx + 1);
                    }
                });
            })
            .catch(function() {
                return tryId(idx + 1);
            });
        }

        return tryId(0);
    })
    .catch(function(err) {
        console.error("Error:", err.message);
    });
