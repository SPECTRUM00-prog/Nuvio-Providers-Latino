/**
 * Extractor de rutas API desde el bundle SPA de CineCalidad
 */

var BASE_URL = "https://www.cinecalidad.am";
var JS_URL = BASE_URL + "/assets/app-Cv8fx5zV.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Descargando bundle JS:", JS_URL);

fetch(JS_URL, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } })
    .then(function(res) {
        console.log("-> Status:", res.status);
        return res.text();
    })
    .then(function(code) {
        console.log("-> Tamaño del bundle:", code.length, "caracteres.\n");

        // 1. Buscar llamadas a fetch o axios con /api/ o endpoints
        var apiRegex = /["'](\/(?:api|v[0-9]|backend|data|wp-json)[^"'\s<>]*)["']/gi;
        var apis = [];
        var m;
        while ((m = apiRegex.exec(code)) !== null) {
            if (apis.indexOf(m[1]) === -1) apis.push(m[1]);
        }
        console.log("[+] Rutas de API detectadas (" + apis.length + "):");
        console.log(apis.slice(0, 25));

        // 2. Buscar referencias a fileCode o player
        console.log("\n[+] Búsqueda de lógica de reproductor / fileCode:");
        var playerMatches = code.match(/[^;]{0,50}(?:fileCode|playerProvider|embedUrl|vimeos)[^;]{0,50}/gi);
        if (playerMatches) {
            console.log(playerMatches.slice(0, 10));
        }

        // 3. Buscar URLs absolutas (endpoints externos o de streaming)
        var urlRegex = /["'](https?:\/\/[a-zA-Z0-9.-]+(?:\/[^"'\s]*)?)["']/gi;
        var urls = [];
        var uMatch;
        while ((uMatch = urlRegex.exec(code)) !== null) {
            var found = uMatch[1];
            if (found.indexOf("w3.org") === -1 && urls.indexOf(found) === -1) {
                urls.push(found);
            }
        }
        console.log("\n[+] Dominios / APIs externas encontradas:");
        console.log(urls.slice(0, 15));
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
