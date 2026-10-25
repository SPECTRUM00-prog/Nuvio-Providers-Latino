/**
 * Auditoría nativa de www.cinecalidad.am (Filtrado estricto)
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
console.log(">>> AUDITANDO www.cinecalidad.am (Búsqueda: \"" + query + "\") <<<");
console.log("=================================================================\n");

var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
console.log("[A] Consultando:", searchUrl);

fetch(searchUrl, { headers: headers })
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length, "bytes");

    // Extraer enlaces limpiando assets estáticos
    var movieLinks = [];
    var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;

    while ((m = regex.exec(html)) !== null) {
        var href = m[1];
        var text = m[2].replace(/<[^>]+>/g, "").trim();

        // Ignorar assets, feeds y enlaces de navegación
        if (href.indexOf("wp-content") === -1 && 
            href.indexOf("wp-includes") === -1 && 
            href.indexOf(".css") === -1 && 
            href.indexOf(".png") === -1 && 
            href.indexOf(".jpg") === -1 && 
            href.indexOf(".ico") === -1 && 
            href.indexOf("xmlrpc") === -1 && 
            href.indexOf("/wp-json/") === -1 && 
            href.indexOf("/category/") === -1 && 
            href.indexOf("/genero/") === -1 && 
            href.indexOf("/tag/") === -1 && 
            href.indexOf("?s=") === -1 && 
            href !== BASE_URL && 
            href !== BASE_URL + "/") {
            
            // Si es relativo, completar con BASE_URL
            if (href.indexOf("http") !== 0) {
                href = BASE_URL + (href.indexOf("/") === 0 ? "" : "/") + href;
            }

            if (movieLinks.map(function(x) { return x.url; }).indexOf(href) === -1) {
                movieLinks.push({ url: href, title: text });
            }
        }
    }

    console.log("\n[+] Películas reales encontradas (" + movieLinks.length + "):");
    for (var i = 0; i < Math.min(5, movieLinks.length); i++) {
        console.log("    [" + (i + 1) + "] " + movieLinks[i].url + " | " + movieLinks[i].title);
    }

    if (movieLinks.length === 0) {
        console.log("[-] No se encontraron enlaces con el filtro.");
        return;
    }

    // Tomar la primera película real
    var targetMovie = movieLinks[0].url;
    console.log("\n=================================================================");
    console.log("[B] DESCARGANDO FICHA DE PELÍCULA:", targetMovie);
    console.log("=================================================================");

    return fetch(targetMovie, { headers: headers })
    .then(function(r) { return r.text(); })
    .then(function(movieHtml) {
        console.log("-> Tamaño HTML de la película:", movieHtml.length, "bytes");

        // 1. Buscar iframes directos
        var iframes = [];
        var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        var im;
        while ((im = ifRegex.exec(movieHtml)) !== null) {
            iframes.push(im[1]);
        }
        console.log("\n[+] Iframes encontrados:", iframes);

        // 2. Buscar enlaces a Vimeos / reproductores en scripts o botones
        var players = [];
        var pRegex = /https?:\/\/[a-zA-Z0-9.-]*(?:vimeos|embed|player|streamwish|hlswish|filemoon|goodstream|videoapp|turboviplay)[^\s"'<>]+/gi;
        var pm;
        while ((pm = pRegex.exec(movieHtml)) !== null) {
            var cleanUrl = pm[0].replace(/\\/g, "").replace(/&amp;/g, "&");
            if (players.indexOf(cleanUrl) === -1) players.push(cleanUrl);
        }
        console.log("\n[+] Reproductores / Servidores detectados:", players);

        // 3. Buscar llamadas AJAX de reproducción (como dooplay o cinecalidad player)
        var ajaxActions = movieHtml.match(/action\s*[:=]\s*["']([^"']+)["']/gi);
        if (ajaxActions) {
            console.log("[+] Acciones AJAX detectadas:", ajaxActions);
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
