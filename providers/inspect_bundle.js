/**
 * Localizador de llamadas a la API en el frontend de LaMovie
 * Ejecución: node providers/inspect_bundle.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Accept": "*/*", "Referer": "https://lamovie.org/" };

console.log("=================================================================");
console.log(">>> BUSCANDO CÓDIGO FUENTE DEL REPRODUCTOR EN LAMOVIE <<<");
console.log("=================================================================");

fetch("https://lamovie.org/peliculas/deadpool-wolverine-2024/", { headers: headers })
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer todos los <script src="...">
    var scripts = [];
    var sRegex = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
    var sm;
    while ((sm = sRegex.exec(html)) !== null) {
        var src = sm[1];
        if (src.indexOf("google") === -1 && src.indexOf("cloudflare") === -1 && src.indexOf("rads") === -1) {
            if (src.indexOf("//") === 0) src = "https:" + src;
            else if (src.indexOf("http") !== 0) src = "https://lamovie.org" + (src.indexOf("/") === 0 ? "" : "/") + src;
            scripts.push(src);
        }
    }

    console.log("[+] Scripts JS del tema encontrados (" + scripts.length + "):");
    for (var i = 0; i < scripts.length; i++) {
        console.log("    [" + (i + 1) + "] " + scripts[i]);
    }

    // 2. Descargar cada script y buscar "/player"
    function scanScript(idx) {
        if (idx >= scripts.length) {
            console.log("\n[-] No se encontraron más scripts.");
            return;
        }

        var sUrl = scripts[idx];
        console.log("\n-> Escaneando script [" + (idx + 1) + "]: " + sUrl);

        fetch(sUrl, { headers: headers })
        .then(function(r) { return r.text(); })
        .then(function(jsCode) {
            var searchTerms = ["wp-api/v1/player", "/player?", "fastApi", "embeds", "Invalid ID"];
            var found = false;

            for (var t = 0; t < searchTerms.length; t++) {
                var term = searchTerms[t];
                var pos = jsCode.indexOf(term);
                if (pos !== -1) {
                    found = true;
                    console.log("    [!] ¡TÉRMINO ENCONTRADO!: \"" + term + "\" en posición " + pos);
                    var start = Math.max(0, pos - 150);
                    var end = Math.min(jsCode.length, pos + 250);
                    console.log("    Código alrededor:\n");
                    console.log("    " + jsCode.substring(start, end).replace(/\r?\n\s*/g, " ") + "\n");
                }
            }

            if (!found) {
                console.log("    (Sin coincidencias relevantes)");
            }
            scanScript(idx + 1);
        })
        .catch(function(err) {
            console.log("    [-] Error descargando " + sUrl + ": " + err.message);
            scanScript(idx + 1);
        });
    }

    scanScript(0);
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
