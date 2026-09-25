/**
 * Rastreador de la variable movieId en los chunks de PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var CHUNKS = [
    BASE_URL + "/_next/static/chunks/b1469352088ffdf4.js",
    BASE_URL + "/_next/static/chunks/dc14c808126fb5b4.js"
];
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Buscando la lógica de movieId en los chunks...");

function searchInChunk(url) {
    console.log("\n-> Descargando:", url);
    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } })
        .then(function(r) { return r.text(); })
        .then(function(code) {
            console.log("   Tamaño:", code.length);

            // 1. Buscar 'movieId'
            var idx = code.indexOf("movieId");
            if (idx !== -1) {
                console.log("   [+] ¡'movieId' encontrado en posición " + idx + "!");
                // Extraer 800 caracteres alrededor
                var snippet = code.substring(Math.max(0, idx - 100), idx + 800);
                console.log("   --- FRAGMENTO DE CÓDIGO ---");
                console.log(snippet);
                console.log("   ---------------------------");
            } else {
                console.log("   [-] 'movieId' no aparece en este chunk.");
            }

            // 2. Buscar si hay peticiones HTTP (/api/ o Server Actions o endpoints)
            var urlsInCode = code.match(/["'](\/[a-zA-Z0-9_\-\/]+)["']/g) || [];
            var interesting = urlsInCode.filter(function(u) {
                return u.indexOf("static") === -1 && u.indexOf("chunks") === -1 && u.length > 5;
            });
            console.log("   Rutas interesantes encontradas:", [...new Set(interesting)].slice(0, 10));
        });
}

searchInChunk(CHUNKS[0]).then(function() {
    return searchInChunk(CHUNKS[1]);
}).catch(function(e) {
    console.error("Error:", e.message);
});
