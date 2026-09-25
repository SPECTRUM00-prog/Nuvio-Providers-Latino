/**
 * Extractor de la función onClick (y) en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var CHUNK_URL = "https://pelisgo.online/_next/static/chunks/0178590330c372b0.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Analizando la función 'y' dentro del chunk...");

fetch(CHUNK_URL, { headers: { "User-Agent": USER_AGENT, "Referer": "https://pelisgo.online/" } })
    .then(function(r) { return r.text(); })
    .then(function(code) {
        var needle = "Opciones de Reproducci";
        var pos = code.indexOf(needle);

        if (pos === -1) {
            console.log("[-] No se encontró la frase.");
            return;
        }

        // Extraer 2500 caracteres ANTES de la frase para ver la definición de 'y'
        var start = Math.max(0, pos - 2000);
        var snippet = code.substring(start, pos + 200);

        console.log("\n--- CÓDIGO DE LA FUNCIÓN onClick (y) ---");
        console.log(snippet);
        console.log("----------------------------------------\n");
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
