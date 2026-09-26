/**
 * Extractor de la firma y props de ClientEpisodePlayerSection
 * Ejecución: node providers/inspect_pelisgo.js
 */

var CHUNK_URL = "https://pelisgo.online/_next/static/chunks/0178590330c372b0.js";
var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] 1. Analizando la definición de ClientEpisodePlayerSection en el chunk JS...");

fetch(CHUNK_URL, { headers: { "User-Agent": USER_AGENT } })
    .then(function(r) { return r.text(); })
    .then(function(code) {
        // Localizar donde se define la función de ClientEpisodePlayerSection
        var needle = "/api/series/episode/";
        var pos = code.indexOf(needle);

        if (pos !== -1) {
            // Extraer 500 caracteres hacia atrás para ver la declaración de parámetros de la función
            var funcSnippet = code.substring(Math.max(0, pos - 450), pos + 100);
            console.log("\n--- FIRMA DE LA FUNCIÓN (PROPS RECIBIDAS) ---");
            console.log(funcSnippet);
            console.log("--------------------------------------------\n");
        }

        console.log("[*] 2. Descargando página del episodio para rastrear las instancias del componente...");
        return fetch(EPISODE_URL, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://pelisgo.online/series/breaking-bad"
            }
        });
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        // Buscar bloques donde se pase un ID junto al título del episodio
        var rscBlocks = html.match(/\{[^{}]*(?:Breaking Bad|Principio del fin|temporada|episodio)[^{}]*\}/gi) || [];
        console.log("[+] Bloques con datos del episodio encontrados (" + rscBlocks.length + "):");
        rscBlocks.slice(0, 3).forEach(function(b) {
            console.log("->", b);
        });

        // Buscar cualquier cuid (cm...) que aparezca cerca de episode o stream
        var cuids = html.match(/cm[a-zA-Z0-9]{20,}/g) || [];
        var uniqueCuids = [...new Set(cuids)];
        console.log("\n[+] Todos los identificadores únicos 'cm...' en la página (" + uniqueCuids.length + "):");
        console.log(uniqueCuids.slice(0, 10));

        // Probar los 5 primeros IDs contra la API de stream de episodios
        console.log("\n[*] 3. Probando identificadores contra /api/series/episode/{id}/stream...");
        function testNext(i) {
            if (i >= Math.min(5, uniqueCuids.length)) return;
            var testId = uniqueCuids[i];
            var testUrl = BASE_URL + "/api/series/episode/" + testId + "/stream";
            return fetch(testUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": EPISODE_URL }
            })
            .then(function(res) {
                return res.json().then(function(data) {
                    if (data && data.links && data.links.length > 0) {
                        console.log("\n=======================================================");
                        console.log("[!!!] ¡ID VÁLIDO ENCONTRADO!:", testId);
                        console.log("      Servidores (" + data.links.length + "):");
                        data.links.forEach(function(l) {
                            console.log("      - " + l.server + " (" + l.language + "): " + l.url);
                        });
                        console.log("=======================================================\n");
                    } else {
                        return testNext(i + 1);
                    }
                });
            })
            .catch(function() {
                return testNext(i + 1);
            });
        }

        return testNext(0);
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
