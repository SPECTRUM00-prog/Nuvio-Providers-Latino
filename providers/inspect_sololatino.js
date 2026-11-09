/**
 * Inspección del script loader de StreamWish (/main.js)
 * Ejecución: node providers/inspect_sololatino.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var mainJsUrl = "https://hglink.to/main.js?v=1.1.9";
var fileId = "z773lo7bqkb2";

console.log("=================================================================");
console.log(">>> DESCARGANDO SCRIPT LOADER: " + mainJsUrl + " <<<");
console.log("=================================================================\n");

fetch(mainJsUrl, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://hglink.to/e/" + fileId
    }
})
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(code) {
    console.log("-> Tamaño de main.js:", code.length, "bytes\n");

    // 1. Mostrar las primeras 500 líneas o caracteres del script
    console.log("=================================================================");
    console.log(">>> CÓDIGO DE MAIN.JS (Primeros 600 caracteres) <<<");
    console.log("=================================================================");
    console.log(code.substring(0, 600).replace(/\r?\n\s*/g, " "));

    // 2. Buscar si hace llamadas fetch, $.ajax, XMLHttpRequest o redirecciones
    var requests = code.match(/(?:fetch|ajax|\.get|\.post|open)\s*\([^)]+\)/gi) || [];
    console.log("\n[+] Llamadas de red detectadas en main.js (" + requests.length + "):");
    for (var i = 0; i < requests.length; i++) {
        console.log("   [" + (i + 1) + "] " + requests[i]);
    }

    // 3. Buscar si construye URLs con endpoints tipo /player, /dl, /sources, .m3u8
    var endpoints = code.match(/["'`]\/[a-zA-Z0-9_\/.-]+["'`]/gi) || [];
    var uniqueEp = [];
    for (var j = 0; j < endpoints.length; j++) {
        if (uniqueEp.indexOf(endpoints[j]) === -1 && endpoints[j].length > 2) {
            uniqueEp.push(endpoints[j]);
        }
    }
    console.log("\n[+] Rutas internas encontradas:");
    console.log(uniqueEp.slice(0, 10));
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
