/**
 * Rastrear el origen de 'sources' en app.js
 * Ejecución: node providers/inspect_sources_caller.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var appJsUrl = "https://lamovie.org/wp-content/themes/lamovie/assets/build/static/assets/app.js?v=1787967824";

console.log("=================================================================");
console.log(">>> BUSCANDO LA LLAMADA A <__ sources={...}> EN APP.JS <<<");
console.log("=================================================================");

fetch(appJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    // Buscar donde se invoca el componente __ con 'sources:'
    var posCaller = code.indexOf("sources:");
    var occurrences = [];

    while (posCaller !== -1) {
        occurrences.push(posCaller);
        posCaller = code.indexOf("sources:", posCaller + 1);
    }

    console.log("[+] Ocurrencias de 'sources:' en app.js:", occurrences.length);

    for (var i = 0; i < occurrences.length; i++) {
        var idx = occurrences[i];
        var start = Math.max(0, idx - 400);
        var end = Math.min(code.length, idx + 400);
        console.log("\n--- Coincidencia [" + (i + 1) + "] en pos " + idx + " ---");
        console.log(code.substring(start, end).replace(/\r?\n\s*/g, " "));
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
