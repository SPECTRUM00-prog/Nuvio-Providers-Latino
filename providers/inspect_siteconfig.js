/**
 * Inspección profunda de siteConfig y API interna
 * Ejecución: node providers/inspect_siteconfig.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

function inspectSite(name, url) {
    console.log("\n=======================================================");
    console.log(">>> AUDITANDO:", name, "(" + url + ") <<<");
    console.log("=======================================================");

    return fetch(url, { headers: headers })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            // 1. Extraer todo el bloque de window.siteConfig
            var configMatch = html.match(/window\.siteConfig\s*=\s*(\{[\s\S]*?\});/);
            if (configMatch) {
                console.log("\n[+] window.siteConfig detectado:");
                console.log(configMatch[1]);
            } else {
                console.log("[-] No se pudo aislar window.siteConfig.");
            }

            // 2. Extraer cualquier URL de API o Ajax en scripts
            var apiMatches = html.match(/https?:\/\/[a-zA-Z0-9.-]*(?:api|ajax|tmdb|v1|embed)[^"'\s<>]+/gi) || [];
            var uniqueApis = [];
            for (var i = 0; i < apiMatches.length; i++) {
                var clean = apiMatches[i].replace(/\\/g, "");
                if (uniqueApis.indexOf(clean) === -1) uniqueApis.push(clean);
            }
            console.log("\n[+] Endpoints / APIs encontradas en el código:");
            console.log(uniqueApis.slice(0, 8));

            // 3. Extraer todos los href sin ningún filtro estricto
            var hrefs = [];
            var hrefRegex = /href=["']([^"']+)["']/gi;
            var hm;
            while ((hm = hrefRegex.exec(html)) !== null) {
                var h = hm[1];
                if (h.indexOf("css") === -1 && h.indexOf("js") === -1 && h !== "#" && h.indexOf("feed") === -1) {
                    if (hrefs.indexOf(h) === -1) hrefs.push(h);
                }
            }
            console.log("\n[+] Muestra de enlaces Href en la página (" + hrefs.length + " en total):");
            console.log(hrefs.slice(0, 10));
        })
        .catch(function(err) {
            console.error("[-] Error:", err.message);
        });
}

inspectSite("CINECALIDAD", "https://cinecalidad.ec/?s=deadpool")
    .then(function() {
        return inspectSite("LAMOVIE", "https://lamovie.org/?s=deadpool");
    });
