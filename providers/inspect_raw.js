/**
 * Script de volcado directo del contenido real
 * Ejecución: node providers/inspect_raw.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

function dump(name, url) {
    console.log("\n=======================================================");
    console.log(">>> " + name + " (" + url + ") <<<");
    console.log("=======================================================");

    return fetch(url, { headers: headers })
        .then(function(res) {
            console.log("-> Status HTTP:", res.status, res.statusText);
            console.log("-> Server Header:", res.headers.get("server"));
            return res.text();
        })
        .then(function(html) {
            console.log("-> Tamaño:", html.length, "bytes");

            var titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
            console.log("-> <TITLE>:", titleMatch ? titleMatch[1].trim() : "No encontrado");

            // Muestra de los primeros 600 caracteres del HTML
            console.log("\n-> Primeros 600 caracteres del HTML:");
            console.log(html.substring(0, 600).replace(/\r?\n\s*/g, " "));

            // Buscar si contiene etiquetas <script> con datos o JSON embebido
            var scripts = [];
            var sRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
            var sm;
            while ((sm = sRegex.exec(html)) !== null) {
                var sContent = sm[1].trim();
                if (sContent.length > 20 && sContent.indexOf("GoogleAnalyticsObject") === -1) {
                    scripts.push(sContent.substring(0, 150));
                }
            }
            console.log("\n-> Scripts inline detectados (" + scripts.length + "):");
            for (var i = 0; i < Math.min(3, scripts.length); i++) {
                console.log("   [" + (i + 1) + "]: " + scripts[i].replace(/\r?\n\s*/g, " ") + "...");
            }
        })
        .catch(function(err) {
            console.error("[-] Error:", err.message);
        });
}

dump("CINECALIDAD", "https://cinecalidad.ec/?s=deadpool")
    .then(function() {
        return dump("LAMOVIE", "https://lamovie.org/?s=deadpool");
    });
