/**
 * Origen de los datos del reproductor (Variable 'h')
 * Ejecución: node providers/inspect_player_origin.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var appJsUrl = "https://lamovie.org/wp-content/themes/lamovie/assets/build/static/assets/app.js?v=1787967824";
var movieUrl = "https://lamovie.org/peliculas/deadpool-wolverine-2024/";

console.log("=================================================================");
console.log(">>> [1/2] RASTREANDO LA DEFINICIÓN DEL COMPONENTE EN APP.JS <<<");
console.log("=================================================================");

fetch(appJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    var posEmbeds = code.indexOf("--player-embeds");
    if (posEmbeds !== -1) {
        // Miramos 2500 caracteres antes del bloque de embeds
        var start = Math.max(0, posEmbeds - 2500);
        console.log("Código previo a los botones del reproductor:\n");
        console.log(code.substring(start, posEmbeds).replace(/\r?\n\s*/g, " "));
        console.log("\n============================================================\n");
    }

    console.log("=================================================================");
    console.log(">>> [2/2] REVISANDO EL HTML DE LA PELÍCULA EN BUSCA DE EMBEDS <<<");
    console.log("=================================================================");

    return fetch(movieUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://lamovie.org/" } })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        console.log("-> Tamaño HTML Película:", html.length, "bytes");

        // Buscar si hay variables con links de video en el HTML
        var matches = html.match(/(?:embeds|servers|players|vimeos|sources)\s*[:=]\s*([\[\{][\s\S]*?[\]\}])/gi);
        if (matches) {
            console.log("[+] ¡Objetos de reproductores encontrados en el HTML! (" + matches.length + "):");
            for (var i = 0; i < Math.min(3, matches.length); i++) {
                console.log("    [" + (i + 1) + "] " + matches[i].substring(0, 200) + "...\n");
            }
        } else {
            console.log("[-] No se encontraron variables literales como 'embeds = ...' en el HTML.");
        }

        // Buscar si hay iframes o scripts tipo JSON
        var jsonScripts = html.match(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonScripts) {
            console.log("[+] Bloques <script type='application/json'> detectados (" + jsonScripts.length + "):");
            console.log(jsonScripts[0].substring(0, 300) + "...\n");
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
