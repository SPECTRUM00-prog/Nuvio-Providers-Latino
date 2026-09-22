/**
 * Script de auditoría e inspección para AnimeJara
 * Ejecución: node providers/inspect_animejara.js "jujutsu kaisen"
 */

var query = process.argv[2] || "jujutsu kaisen";
var BASE_URL = "https://animejara.com";
var AJAX_URL = BASE_URL + "/wp-admin/admin-ajax.php";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Referer": BASE_URL + "/",
    "X-Requested-With": "XMLHttpRequest"
};

console.log("=== 1. AUDITANDO BÚSQUEDA AJAX ===");
console.log("Consultando query: \"" + query + "\" en " + AJAX_URL);

fetch(AJAX_URL, {
    method: "POST",
    headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": BASE_URL + "/",
        "X-Requested-With": "XMLHttpRequest"
    },
    body: "action=live_search&s=" + encodeURIComponent(query)
})
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(text) {
    console.log("-> Longitud de respuesta:", text.length);
    console.log("-> Primeros 300 caracteres:");
    console.log(text.substring(0, 300));

    try {
        var json = JSON.parse(text);
        console.log("\n[+] Búsqueda AJAX parseada con éxito:");
        console.log(JSON.stringify(json, null, 2).substring(0, 500) + "...\n");
    } catch(e) {
        console.log("\n[-] No es JSON válido o devolvió HTML/Desafío.");
    }

    console.log("=== 2. AUDITANDO PÁGINA DEL ANIME ===");
    var animeUrl = BASE_URL + "/anime/jujutsu-kaisen";
    console.log("Descargando: " + animeUrl);

    return fetch(animeUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
    });
})
.then(function(res) {
    console.log("-> Status HTTP Anime:", res.status);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length);

    // Buscar cómo estructuran los enlaces de episodios
    var epMatches = [];
    var regex = /href=["']([^"']*(?:episode|ver|capitulo)[^"']*)["']/gi;
    var m;
    while ((m = regex.exec(html)) !== null) {
        if (epMatches.indexOf(m[1]) === -1) epMatches.push(m[1]);
    }

    console.log("\n[+] Enlaces de episodios encontrados en el HTML (" + epMatches.length + "):");
    console.log(epMatches.slice(0, 5));

    // Buscar si tienen IDs del anime o datos para el reproductor
    var idAnime = html.match(/(?:idanime|data-idanime|data-id)\s*[:=]\s*["']?(\d+)/i);
    console.log("\n[+] ID del Anime detectado en HTML:", idAnime ? idAnime[1] : "No encontrado");

    // Probar estructura de un episodio directo si existe
    var testEp = epMatches[0] || (BASE_URL + "/episode/jujutsu-kaisen-1x1/");
    if (testEp.indexOf("http") !== 0) testEp = BASE_URL + testEp;
    
    console.log("\n=== 3. AUDITANDO PÁGINA DEL EPISODIO ===");
    console.log("Descargando episodio de prueba:", testEp);

    return fetch(testEp, {
        headers: { "User-Agent": USER_AGENT, "Referer": animeUrl }
    });
})
.then(function(res) {
    console.log("-> Status HTTP Episodio:", res.status);
    return res.text();
})
.then(function(epHtml) {
    console.log("-> Tamaño HTML Episodio:", epHtml.length);

    // Buscar iframes o scripts del reproductor
    var iframes = [];
    var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    var im;
    while ((im = ifRegex.exec(epHtml)) !== null) {
        iframes.push(im[1]);
    }
    console.log("\n[+] Iframes detectados en el episodio:");
    console.log(iframes);
})
.catch(function(err) {
    console.error("\n[-] Error durante la auditoría:", err.message);
});
