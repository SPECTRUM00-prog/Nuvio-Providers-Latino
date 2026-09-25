/**
 * Localizador de la función de carga de servidores en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TARGET_URL = "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Buscando la función 'cargar los servidores' en los chunks de Next.js...");

fetch(TARGET_URL, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // Extraer todos los chunks de Next.js incluidos en la página
        var chunkRegex = /src=["'](\/_next\/static\/chunks\/[^"']+\.js)["']/gi;
        var chunks = [];
        var m;
        while ((m = chunkRegex.exec(html)) !== null) {
            if (chunks.indexOf(m[1]) === -1) chunks.push(m[1]);
        }

        console.log("[+] Chunks detectados en la página (" + chunks.length + "):");

        function searchNextChunk(idx) {
            if (idx >= chunks.length) {
                console.log("[-] No se encontró la frase en los chunks escaneados.");
                return;
            }

            var chunkPath = chunks[idx];
            var fullUrl = BASE_URL + chunkPath;

            return fetch(fullUrl, { headers: { "User-Agent": USER_AGENT, "Referer": TARGET_URL } })
                .then(function(r) { return r.text(); })
                .then(function(code) {
                    var needle = "cargar los servidores";
                    var pos = code.indexOf(needle);

                    if (pos === -1) {
                        needle = "Opciones de Reproducci";
                        pos = code.indexOf(needle);
                    }

                    if (pos !== -1) {
                        console.log("\n[!!!] ¡FUNCIÓN ENCONTRADA EN EL CHUNK: " + chunkPath + "!");
                        // Imprimir 2000 caracteres alrededor para ver el onClick y la llamada de red
                        var snippet = code.substring(Math.max(0, pos - 1000), pos + 1000);
                        console.log("--- CÓDIGO DEL BOTÓN Y LA PETICIÓN ---");
                        console.log(snippet);
                        console.log("--------------------------------------");
                        return; // Detener la búsqueda
                    }

                    return searchNextChunk(idx + 1);
                })
                .catch(function() {
                    return searchNextChunk(idx + 1);
                });
        }

        return searchNextChunk(0);
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
