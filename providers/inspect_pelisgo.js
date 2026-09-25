/**
 * Análisis profundo de Next.js, buscador y enlaces en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] INSPECCIÓN DE RUTAS Y ESTRUCTURA: PelisGO");
console.log("==================================================\n");

console.log("[1] Analizando catálogo y enlaces en la portada...");

fetch(BASE_URL, { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        // 1. Extraer enlaces relevantes a películas o series
        var linkRegex = /href=["']([^"']*(?:\/pelicula\/|\/serie\/|\/ver\/|\/movie\/|\/tv\/|\/watch\/)[^"']*)["']/gi;
        var links = [];
        var m;
        while ((m = linkRegex.exec(html)) !== null) {
            var full = m[1];
            if (full.indexOf("http") !== 0) full = BASE_URL + (full.indexOf("/") === 0 ? full : "/" + full);
            if (links.indexOf(full) === -1) links.push(full);
        }

        console.log("-> Enlaces de películas/series encontrados (" + links.length + "):");
        console.log(links.slice(0, 8));

        // 2. Comprobar si usa __NEXT_DATA__
        var nextDataMatch = html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
            console.log("\n[+] Detectado __NEXT_DATA__ (Next.js Pages Router).");
            try {
                var parsedNext = JSON.parse(nextDataMatch[1]);
                console.log("    Build ID:", parsedNext.buildId);
                console.log("    Ruta actual:", parsedNext.page);
            } catch(e) {}
        } else {
            console.log("\n[+] Next.js App Router detectado (moderno con Turbopack).");
        }

        // 3. Probar posibles endpoints de búsqueda
        console.log("\n[2] Probando rutas de búsqueda comunes en PelisGO...");
        var testSearchUrls = [
            BASE_URL + "/buscar?q=Oppenheimer",
            BASE_URL + "/search?q=Oppenheimer",
            BASE_URL + "/explorar?q=Oppenheimer",
            BASE_URL + "/api/search?q=Oppenheimer",
            BASE_URL + "/api/movies/search?q=Oppenheimer"
        ];

        function trySearch(idx) {
            if (idx >= testSearchUrls.length) {
                console.log("[-] Fin de pruebas de búsqueda directa.");
                return inspectFirstItem(links[0]);
            }

            var target = testSearchUrls[idx];
            return fetch(target, { headers: headers, redirect: "follow" })
                .then(function(r) {
                    var isJson = (r.headers.get("content-type") || "").indexOf("json") !== -1;
                    console.log("   -> Probando [" + r.status + "]: " + target + (isJson ? " (Devolvió JSON)" : ""));
                    if (r.status === 200 && isJson) {
                        return r.text().then(function(t) {
                            console.log("      [!] API JSON ENCONTRADA:", t.substring(0, 300));
                        });
                    }
                    return trySearch(idx + 1);
                })
                .catch(function() {
                    return trySearch(idx + 1);
                });
        }

        return trySearch(0);
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });

function inspectFirstItem(itemUrl) {
    if (!itemUrl) {
        console.log("\n[-] No hay enlaces para inspeccionar reproductor.");
        return;
    }

    console.log("\n[3] Inspeccionando reproductor en primer contenido:", itemUrl);
    return fetch(itemUrl, { headers: headers, redirect: "follow" })
        .then(function(r) { return r.text(); })
        .then(function(pageHtml) {
            console.log("-> Tamaño recibido:", pageHtml.length, "caracteres");

            // Buscar iframes
            var iframes = [];
            var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
            var im;
            while ((im = ifRegex.exec(pageHtml)) !== null) {
                iframes.push(im[1]);
            }
            console.log("[+] Iframes detectados:", iframes);

            // Buscar enlaces a servidores conocidos
            var hosters = pageHtml.match(/https?:\/\/[^"'\s<>]*(?:streamwish|vidhide|morencius|filemoon|vimeos|goodstream|voe)[^"'\s<>]*/gi) || [];
            console.log("[+] Hosters encontrados en el HTML:", [...new Set(hosters)].slice(0, 5));
        });
}
