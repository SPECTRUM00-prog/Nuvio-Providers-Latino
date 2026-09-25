/**
 * Script de auditoría para PelisPedia (pelispedia.mov)
 * Ejecución: node providers/inspect_pelispedia.js "Oppenheimer" movie
 *             node providers/inspect_pelispedia.js "Breaking Bad" tv
 */

var query = process.argv[2] || "Oppenheimer";
var mediaType = process.argv[3] || "movie";
var isTv = mediaType === "tv" || mediaType === "series";

var BASE_URL = "https://pelispedia.mov";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITORÍA DE PELISPEDIA: \"" + query + "\" (" + (isTv ? "SERIE" : "PELÍCULA") + ")");
console.log("==================================================\n");

// 1. Probar conectividad al dominio base
console.log("[1] Probando dominio base:", BASE_URL);
fetch(BASE_URL, { headers: headers, redirect: "follow" })
    .then(function(res) {
        console.log("-> Status Base HTTP:", res.status, res.statusText);
        console.log("-> URL final:", res.url);
        console.log("-> Servidor:", res.headers.get("server") || "N/A");
        console.log("-> Cloudflare Ray:", res.headers.get("cf-ray") || "Sin Cloudflare");

        // 2. Probar buscador de PelisPedia
        var searchUrl = BASE_URL + "/search?s=" + encodeURIComponent(query).replace(/%20/g, "+");
        console.log("\n[2] Consultando buscador:", searchUrl);
        return fetch(searchUrl, { headers: headers, redirect: "follow" });
    })
    .then(function(res) {
        console.log("-> Status Búsqueda:", res.status, res.statusText);
        return res.text();
    })
    .then(function(html) {
        console.log("-> Tamaño de HTML recibido:", html.length, "caracteres");

        // Extraer enlaces a películas o series
        var linkRegex = /<a\s+[^>]*href=["']((?:https?:\/\/[^"']*)?\/(?:serie|pelicula|anime)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var results = [];
        var match;

        while ((match = linkRegex.exec(html)) !== null) {
            var rawLink = match[1];
            var innerHtml = match[2];
            var fullLink = rawLink.indexOf("http") === 0 ? rawLink : BASE_URL + rawLink;

            var titleMatch = innerHtml.match(/<h[456][^>]*class=["'][^"']*line-clamp-2[^"']*["'][^>]*>([^<]+)<\/h[456]>/i) ||
                             innerHtml.match(/alt=["']([^"']+)["']/i) ||
                             innerHtml.match(/title=["']([^"']+)["']/i);

            var title = titleMatch ? titleMatch[1].trim() : "Sin título";

            var exists = false;
            for (var r = 0; r < results.length; r++) {
                if (results[r].url === fullLink) { exists = true; break; }
            }
            if (!exists) results.push({ url: fullLink, title: title });
        }

        console.log("\n[3] Resultados encontrados (" + results.length + "):");
        for (var i = 0; i < results.length; i++) {
            console.log("   [" + (i + 1) + "] " + results[i].title + " -> " + results[i].url);
        }

        if (results.length === 0) {
            console.log("[-] No se encontraron resultados.");
            return;
        }

        // 3. Inspeccionar el primer resultado
        var firstItem = results[0];
        var targetPage = firstItem.url;
        if (isTv) {
            targetPage = targetPage.replace(/\/$/, "") + "/temporada/1/capitulo/1";
        }

        console.log("\n[4] Inspeccionando página de contenido:", targetPage);
        return fetch(targetPage, { headers: headers, redirect: "follow" })
            .then(function(r) { return r.text(); })
            .then(function(pageHtml) {
                console.log("-> Tamaño HTML contenido:", pageHtml.length);

                // Buscar player IDs o vidurl
                var playerIds = [];
                var iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
                var im;
                while ((im = iframeRegex.exec(pageHtml)) !== null) {
                    var src = im[1];
                    var vidMatch = src.match(/\/vidurl\/([^\/]+)/i);
                    if (vidMatch && playerIds.indexOf(vidMatch[1]) === -1) {
                        playerIds.push(vidMatch[1]);
                    }
                }

                console.log("[+] Player IDs encontrados en la página:", playerIds);

                // Comprobar si hay iframes a embed69 directos
                var embed69Matches = pageHtml.match(/https?:\/\/embed69\.org\/[^\s"'<>]+/gi) || [];
                console.log("[+] Enlaces directos a Embed69:", embed69Matches);
            });
    })
    .catch(function(err) {
        console.error("[-] Error en la auditoría:", err.message);
    });
