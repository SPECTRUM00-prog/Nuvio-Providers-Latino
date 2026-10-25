/**
 * Extractor exacto de tarjetas y reproductores para www.cinecalidad.am
 * Ejecución: node providers/inspect_cinecalidad_am.js "deadpool"
 */

var query = process.argv[2] || "deadpool";
var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("=================================================================");
console.log(">>> INSPECCIONANDO RESULTADOS EN www.cinecalidad.am <<<");
console.log("=================================================================\n");

fetch(BASE_URL + "/?s=" + encodeURIComponent(query), { headers: headers })
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer todos los enlaces que tienen texto relevante o imagen de póster
    var candidates = [];
    var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;

    while ((m = regex.exec(html)) !== null) {
        var href = m[1];
        var inner = m[2];
        var text = inner.replace(/<[^>]+>/g, "").trim();

        // Descartar navegación, cabecera y enlaces externos
        if (href.indexOf("cinecalidad.am") !== -1 &&
            href.indexOf("/espana") === -1 &&
            href.indexOf("/ver-serie") === -1 &&
            href.indexOf("/fecha-de-lanzamiento") === -1 &&
            href.indexOf("/page/") === -1 &&
            href.indexOf("?s=") === -1 &&
            href.indexOf("wp-") === -1 &&
            href !== BASE_URL && href !== BASE_URL + "/") {

            // Comprobar si el texto o la URL contiene la búsqueda
            var isRelevant = href.toLowerCase().indexOf("deadpool") !== -1 || text.toLowerCase().indexOf("deadpool") !== -1;
            
            if (candidates.map(function(x){ return x.url; }).indexOf(href) === -1) {
                candidates.push({ url: href, title: text, relevant: isRelevant });
            }
        }
    }

    console.log("[+] Enlaces internos filtrados (" + candidates.length + "):");
    for (var i = 0; i < Math.min(10, candidates.length); i++) {
        console.log("    [" + (i + 1) + "] " + candidates[i].url + (candidates[i].title ? " | " + candidates[i].title : ""));
    }

    // Elegir el primer candidato que coincida con la película
    var targetMovie = null;
    for (var c = 0; c < candidates.length; c++) {
        if (candidates[c].relevant) {
            targetMovie = candidates[c].url;
            break;
        }
    }
    if (!targetMovie && candidates.length > 0) targetMovie = candidates[0].url;

    if (!targetMovie) {
        console.log("[-] No se encontró ninguna URL de película.");
        return;
    }

    console.log("\n=================================================================");
    console.log(">>> DESCARGANDO FICHA REAL:", targetMovie);
    console.log("=================================================================");

    return fetch(targetMovie, { headers: headers })
    .then(function(r) { return r.text(); })
    .then(function(movieHtml) {
        console.log("-> Tamaño HTML:", movieHtml.length, "bytes");

        // Buscar iframes
        var iframes = [];
        var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var im;
        while ((im = ifRegex.exec(movieHtml)) !== null) {
            iframes.push(im[1]);
        }
        console.log("\n[+] Iframes encontrados:", iframes);

        // Buscar lockers (Vimeos, StreamWish, etc.)
        var lockers = [];
        var lkRegex = /https?:\/\/[a-zA-Z0-9.-]*(?:vimeos|embed|player|streamwish|hlswish|filemoon|goodstream|videoapp|turboviplay)[^\s"'<>]+/gi;
        var lm;
        while ((lm = lkRegex.exec(movieHtml)) !== null) {
            var clk = lm[0].replace(/\\/g, "").replace(/&amp;/g, "&");
            if (lockers.indexOf(clk) === -1) lockers.push(clk);
        }
        console.log("\n[+] Reproductores detectados:", lockers);

        // Buscar si los servidores vienen en atributos data- (ej: Dooplay o Cinecalidad tabs)
        var dataUrls = [];
        var dRegex = /data-(?:url|link|player|embed|code)=["']([^"']+)["']/gi;
        var dm;
        while ((dm = dRegex.exec(movieHtml)) !== null) {
            dataUrls.push(dm[1]);
        }
        if (dataUrls.length > 0) {
            console.log("\n[+] Enlaces en atributos data-*:", dataUrls.slice(0, 8));
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
