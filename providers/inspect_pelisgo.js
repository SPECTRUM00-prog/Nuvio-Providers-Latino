/**
 * Inspección de resultados de búsqueda y reproductor en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

var searchUrl = BASE_URL + "/search?q=Oppenheimer";
console.log("==================================================");
console.log("[*] INSPECCIONANDO RESULTADOS EN: " + searchUrl);
console.log("==================================================\n");

fetch(searchUrl, { headers: headers, redirect: "follow" })
    .then(function(res) {
        console.log("-> Status HTTP:", res.status, res.statusText);
        return res.text();
    })
    .then(function(html) {
        console.log("-> Tamaño HTML de búsqueda:", html.length, "caracteres.");

        // 1. Extraer TODOS los enlaces <a> para ver cómo son sus rutas
        var allLinks = [];
        var aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
        var m;
        while ((m = aRegex.exec(html)) !== null) {
            var href = m[1];
            if (href !== "/" && href.indexOf("#") !== 0 && href.indexOf("http") !== 0) {
                if (allLinks.indexOf(href) === -1) allLinks.push(href);
            }
        }

        console.log("\n[+] Rutas internas encontradas en la página de búsqueda (" + allLinks.length + "):");
        console.log(allLinks.slice(0, 15));

        // 2. Extraer fragmentos con títulos o posters
        var targetLink = null;
        for (var i = 0; i < allLinks.length; i++) {
            var l = allLinks[i].toLowerCase();
            if (l.indexOf("oppenheimer") !== -1) {
                targetLink = allLinks[i];
                break;
            }
        }

        if (!targetLink && allLinks.length > 0) {
            targetLink = allLinks[0];
        }

        if (!targetLink) {
            console.log("\n[-] No se detectaron enlaces evidentes. Mostrando fragmento de HTML:");
            console.log(html.substring(0, 600));
            return;
        }

        var fullTargetUrl = BASE_URL + (targetLink.indexOf("/") === 0 ? "" : "/") + targetLink;
        console.log("\n[+] Contenido detectado para inspeccionar:", fullTargetUrl);

        return fetch(fullTargetUrl, { headers: headers, redirect: "follow" })
            .then(function(r) { return r.text(); })
            .then(function(itemHtml) {
                console.log("-> Tamaño HTML de la página del contenido:", itemHtml.length);

                // Buscar iframes o reproductores
                var iframes = [];
                var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
                var im;
                while ((im = ifRegex.exec(itemHtml)) !== null) {
                    iframes.push(im[1]);
                }
                console.log("\n[+] Iframes encontrados:", iframes);

                // Buscar enlaces o referencias a servidores de video
                var servers = itemHtml.match(/https?:\/\/[^"'\s<>]*(?:streamwish|vidhide|morencius|filemoon|vimeos|goodstream|voe|embed)[^"'\s<>]*/gi) || [];
                var uniqueServers = [];
                for (var s = 0; s < servers.length; s++) {
                    if (uniqueServers.indexOf(servers[s]) === -1) uniqueServers.push(servers[s]);
                }
                console.log("[+] Servidores / Embeds detectados:", uniqueServers.slice(0, 8));

                // Buscar scripts o JSON empotrados con enlaces
                var jsonMatches = itemHtml.match(/["'](https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)["']/gi) || [];
                console.log("[+] Enlaces directos de video (.m3u8 / .mp4):", jsonMatches);
            });
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
