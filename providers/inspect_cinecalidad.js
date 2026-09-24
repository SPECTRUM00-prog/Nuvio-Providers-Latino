/**
 * Script de auditoría para CineCalidad (Versión LITE / Actual)
 * Uso: 
 *   node providers/inspect_cinecalidad.js "nombre de pelicula o serie" [tv|movie]
 * Ejemplos:
 *   node providers/inspect_cinecalidad.js "Oppenheimer" movie
 *   node providers/inspect_cinecalidad.js "Fallout" tv
 */

var query = process.argv[2] || "Oppenheimer";
var mediaType = process.argv[3] || "movie";
var isTv = mediaType === "tv" || mediaType === "series";

var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITORÍA CINECALIDAD: \"" + query + "\" (" + (isTv ? "SERIE" : "PELÍCULA") + ")");
console.log("==================================================\n");

var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
console.log("[1] Consultando búsqueda:", searchUrl);

fetch(searchUrl, { headers: headers, redirect: "follow" })
    .then(function(res) {
        console.log("-> Status HTTP:", res.status, res.statusText);
        return res.text();
    })
    .then(function(html) {
        console.log("-> Tamaño de HTML recibido:", html.length, "caracteres");

        // 1. Extraer todos los links a películas y series
        var linkPattern = /href=["']((?:https?:\/\/[^"']*)?\/(?:pelicula|ver-pelicula|serie|ver-serie)\/[^"']+)["']/gi;
        var allLinks = [];
        var m;
        while ((m = linkPattern.exec(html)) !== null) {
            var fullUrl = m[1];
            if (fullUrl.indexOf("http") !== 0) fullUrl = BASE_URL + (fullUrl.indexOf("/") === 0 ? fullUrl : "/" + fullUrl);
            if (allLinks.indexOf(fullUrl) === -1) allLinks.push(fullUrl);
        }

        console.log("\n[2] RESULTADOS ENCONTRADOS EN LA PÁGINA (" + allLinks.length + "):");
        for (var i = 0; i < allLinks.length; i++) {
            console.log("   [" + (i + 1) + "] " + allLinks[i]);
        }

        // 2. Verificar si hay avisos de 'no encontrado'
        if (html.indexOf("No se encontraron") !== -1 || html.indexOf("sin resultados") !== -1 || html.indexOf("no matching") !== -1) {
            console.log("\n[!] AVISO: El HTML contiene texto explícito de 'Sin resultados'.");
        }

        // 3. Inspeccionar el primer enlace encontrado
        if (allLinks.length === 0) {
            console.log("\n[-] No se encontraron enlaces para inspeccionar.");
            return;
        }

        var targetUrl = allLinks[0];
        console.log("\n[3] INSPECCIONANDO PRIMER ENLACE:", targetUrl);

        return fetch(targetUrl, { headers: headers, redirect: "follow" })
            .then(function(r) { return r.text(); })
            .then(function(itemHtml) {
                console.log("-> Tamaño HTML del contenido:", itemHtml.length);

                // Si es serie, auditar cómo están estructurados los episodios
                if (isTv) {
                    console.log("\n[+] Analizando estructura de episodios de la serie...");
                    var epMatches = [];
                    var epRegex = /href=["']([^"']*(?:episodio|capitulo|season|temporada)[^"']*)["']/gi;
                    var em;
                    while ((em = epRegex.exec(itemHtml)) !== null) {
                        if (epMatches.indexOf(em[1]) === -1) epMatches.push(em[1]);
                    }
                    console.log("-> Enlaces de episodios detectados (" + epMatches.length + "):");
                    console.log(epMatches.slice(0, 8));

                    // Si hay enlace a un episodio, descargar el primero para ver los embeds
                    if (epMatches.length > 0) {
                        var firstEp = epMatches[0];
                        if (firstEp.indexOf("http") !== 0) firstEp = BASE_URL + (firstEp.indexOf("/") === 0 ? firstEp : "/" + firstEp);
                        console.log("\n[+] Descargando primer episodio para ver reproductores:", firstEp);
                        return fetch(firstEp, { headers: headers, redirect: "follow" })
                            .then(function(er) { return er.text(); })
                            .then(function(epHtml) {
                                inspectEmbeds(epHtml);
                            });
                    }
                } else {
                    inspectEmbeds(itemHtml);
                }
            });
    })
    .catch(function(err) {
        console.error("[-] Error en la auditoría:", err.message);
    });

function inspectEmbeds(html) {
    console.log("\n[4] REPRODUCTORES Y EMBEDS DETECTADOS EN EL CONTENIDO:");
    
    // Opciones de reproductor (data-option, data-url, etc.)
    var options = [];
    var optRegex = /(?:data-option|data-url|data-src|data-link)=["']([^"']+)["']/gi;
    var om;
    while ((om = optRegex.exec(html)) !== null) {
        options.push(om[1]);
    }
    console.log("-> Parámetros de reproducción (data-*):", options);

    // Iframes
    var iframes = [];
    var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    var im;
    while ((im = ifRegex.exec(html)) !== null) {
        iframes.push(im[1]);
    }
    console.log("-> Iframes directos:", iframes);

    // Enlaces directos a hosters
    var hosters = [];
    var hRegex = /href=["'](https?:\/\/[^"']*(?:vimeos|goodstream|hlswish|streamwish|filemoon|videoapp|waaw)[^"']*)["']/gi;
    var hm;
    while ((hm = hRegex.exec(html)) !== null) {
        hosters.push(hm[1]);
    }
    console.log("-> Enlaces a servidores conocidos:", hosters);
}
