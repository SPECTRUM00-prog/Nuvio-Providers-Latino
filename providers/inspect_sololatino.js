/**
 * Extractor de la ruta real del reproductor en app-*.js de sololatino.net
 * Ejecución: node providers/inspect_sololatino.js
 */

var APP_JS_URL = "https://sololatino.net/build/assets/app-Bd31cN3M.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": "https://sololatino.net/pelicula/coraline-y-la-puerta-secreta"
};

console.log("=================================================================");
console.log(">>> DESCARGANDO Y ANALIZANDO: " + APP_JS_URL + " <<<");
console.log("=================================================================");

fetch(APP_JS_URL, { headers: headers })
.then(function(res) { return res.text(); })
.then(function(code) {
    console.log("-> app.js descargado:", code.length, "bytes\n");

    var searchTerms = [
        "data-player-token",
        "data-server-btn",
        "player-frame",
        "player-tab"
    ];

    for (var i = 0; i < searchTerms.length; i++) {
        var term = searchTerms[i];
        var pos = code.indexOf(term);

        console.log("=================================================================");
        console.log("Buscando término: \"" + term + "\"");
        console.log("=================================================================");

        if (pos === -1) {
            console.log("[-] No se encontró el término.\n");
            continue;
        }

        var matchCount = 0;
        while (pos !== -1) {
            matchCount++;
            var start = Math.max(0, pos - 400);
            var end = Math.min(code.length, pos + 600);
            var snippet = code.substring(start, end).replace(/\r?\n\s*/g, " ");

            console.log("\n--- Coincidencia [" + matchCount + "] en pos " + pos + " ---");
            console.log(snippet);

            pos = code.indexOf(term, pos + term.length + 1);
        }
        console.log("\n");
    }
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
