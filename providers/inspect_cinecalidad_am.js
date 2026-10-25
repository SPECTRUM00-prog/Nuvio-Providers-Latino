/**
 * Auditoría nativa de www.cinecalidad.am
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
console.log(">>> AUDITANDO EXCLUSIVAMENTE: www.cinecalidad.am <<<");
console.log("=================================================================\n");

// 1. Probar búsqueda nativa en cinecalidad.am
var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
console.log("[A] Consultando buscador en:", searchUrl);

fetch(searchUrl, { headers: headers })
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length, "bytes");

    // 2. Extraer enlaces a películas en cinecalidad.am
    var links = [];
    var regex = /href=["'](https?:\/\/(?:www\.)?cinecalidad\.am\/[^"']+)["']/gi;
    var m;
    while ((m = regex.exec(html)) !== null) {
        var h = m[1];
        // Filtrar páginas del sistema, categorías o feeds
        if (h.indexOf("/page/") === -1 && h.indexOf("/category/") === -1 && 
            h.indexOf("/genero/") === -1 && h.indexOf("?s=") === -1 && 
            h.indexOf("/feed/") === -1 && h !== BASE_URL + "/") {
            if (links.indexOf(h) === -1) links.push(h);
        }
    }

    console.log("\n[+] Enlaces a películas encontrados en cinecalidad.am (" + links.length + "):");
    for (var i = 0; i < Math.min(5, links.length); i++) {
        console.log("    [" + (i + 1) + "] " + links[i]);
    }

    if (links.length === 0) {
        console.log("[-] No se extrajeron enlaces con filtro. Mostrando primeros 300 caracteres del HTML:");
        console.log(html.substring(0, 300));
        return;
    }

    // 3. Descargar la primera película y ver sus reproductores reales
    var movieUrl = links[0];
    console.log("\n[B] Descargando ficha de película:", movieUrl);

    return fetch(movieUrl, { headers: headers })
    .then(function(r) { return r.text(); })
    .then(function(movieHtml) {
        console.log("-> Tamaño HTML de la película:", movieHtml.length, "bytes");

        // Buscar Vimeos, lockers o iframes
        var lockers = [];
        var vimeosRegex = /https?:\/\/[a-zA-Z0-9.-]*(?:vimeos|embed|player|streamwish|hlswish|filemoon|goodstream|videoapp)[^\s"'<>]+/gi;
        var vm;
        while ((vm = vimeosRegex.exec(movieHtml)) !== null) {
            var lk = vm[0].replace(/\\/g, "");
            if (lockers.indexOf(lk) === -1) lockers.push(lk);
        }

        console.log("\n[+] Reproductores detectados en cinecalidad.am (" + lockers.length + "):");
        for (var j = 0; j < lockers.length; j++) {
            console.log("    - " + lockers[j]);
        }
    });
})
.catch(function(err) {
    console.error("[-] Error auditando cinecalidad.am:", err.message);
});
