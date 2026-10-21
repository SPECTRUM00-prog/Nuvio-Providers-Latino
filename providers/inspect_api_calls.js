/**
 * Extractor de llamadas a la API en app.js de LaMovie / Cinecalidad
 * Ejecución: node providers/inspect_api_calls.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var appJsUrl = "https://lamovie.org/wp-content/themes/lamovie/assets/build/static/assets/app.js?v=1787967824";

console.log("=================================================================");
console.log(">>> EXTRAYENDO TODAS LAS RUTAS DE API EN APP.JS <<<");
console.log("=================================================================");

fetch(appJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    console.log("-> app.js descargado:", code.length, "bytes\n");

    // 1. Ver qué código alimenta a "--player-embeds" (alrededor de pos 861723)
    var posEmbeds = code.indexOf("--player-embeds");
    if (posEmbeds !== -1) {
        var start = Math.max(0, posEmbeds - 800);
        var end = Math.min(code.length, posEmbeds + 200);
        console.log("=== BLOQUE DEL REPRODUCTOR (Alrededor de --player-embeds) ===");
        console.log(code.substring(start, end).replace(/\r?\n\s*/g, " "));
        console.log("============================================================\n");
    }

    // 2. Buscar todas las llamadas fetch / axios que concatenan fastApi o apiUrl
    console.log("=== LLAMADAS A FASTAPI Y APIURL DETECTADAS ===");
    var apiRegex = /(?:fastApi|apiUrl)[^;]{1,120}?(?:fetch|axios|\$http|\.get|\.post)\s*\([^)]+\)/gi;
    var m;
    var count = 0;
    while ((m = apiRegex.exec(code)) !== null) {
        console.log("[" + (++count) + "] " + m[0].replace(/\r?\n\s*/g, " "));
    }

    // 3. Buscar URLs relativas que comiencen con /player o /post o /movie
    console.log("\n=== RUTAS RELATIVAS CON /player O /links ===");
    var routeRegex = /["'`](\/(?:wp-api|wp-json|api|v1)?\/(?:player|links|servers|stream|embed)[^"'`\s]*)["'`]/gi;
    var rm;
    var routes = [];
    while ((rm = routeRegex.exec(code)) !== null) {
        if (routes.indexOf(rm[1]) === -1) {
            routes.push(rm[1]);
            console.log("-> Ruta encontrada: " + rm[1]);
        }
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
