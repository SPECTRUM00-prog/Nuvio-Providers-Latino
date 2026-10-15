/**
 * Script de auditoría e inspección técnica para AnimeJara
 * Ejecución: node providers/inspect_animejara.js "jujutsu kaisen"
 */

var query = process.argv[2] || "jujutsu kaisen";
var BASE_URL = "https://animejara.com";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var defaultHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

function checkCloudflare(headers, html) {
    var isCfServer = (headers.get("server") || "").toLowerCase().indexOf("cloudflare") !== -1;
    var cfRay = headers.get("cf-ray");
    var hasChallenge = html.indexOf("Just a moment...") !== -1 || 
                       html.indexOf("cf-mitigated") !== -1 || 
                       html.indexOf("challenge-platform") !== -1 ||
                       html.indexOf("turnstile") !== -1;

    console.log("   [Cloudflare Header 'Server']:", isCfServer ? "SÍ (Cloudflare activo)" : "No");
    console.log("   [Cloudflare 'cf-ray']:", cfRay || "Ninguno");
    console.log("   [Página de Desafío/Captcha]:", hasChallenge ? "¡BLOQUEADO POR CHALLENGE!" : "Limpio (HTML accesible)");
    return hasChallenge;
}

console.log("=================================================================");
console.log(">>> PASO 1: TEST DE ACCESO AL HOME Y DETECCIÓN CLOUDFLARE <<<");
console.log("=================================================================");

fetch(BASE_URL + "/", { headers: defaultHeaders })
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    var isCf = (res.headers.get("server") || "").indexOf("cloudflare") !== -1;
    return res.text().then(function(html) {
        checkCloudflare(res.headers, html);
        console.log("-> Bytes recibidos:", html.length);
        return { status: res.status, html: html };
    });
})
.then(function(homeData) {
    console.log("\n=================================================================");
    console.log(">>> PASO 2: AUDITANDO BÚSQUEDA (AJAX POST vs BÚSQUEDA GET) <<<");
    console.log("=================================================================");

    var ajaxUrl = BASE_URL + "/wp-admin/admin-ajax.php";
    var ajaxHeaders = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE_URL + "/"
    };

    console.log("[A] Probando AJAX live_search en:", ajaxUrl);
    return fetch(ajaxUrl, {
        method: "POST",
        headers: ajaxHeaders,
        body: "action=live_search&s=" + encodeURIComponent(query)
    })
    .then(function(res) {
        console.log("   -> AJAX Status:", res.status);
        return res.text().then(function(text) {
            checkCloudflare(res.headers, text);
            console.log("   -> Tamaño respuesta AJAX:", text.length);
            console.log("   -> Primeros 200 caracteres:", text.substring(0, 200).replace(/\r?\n/g, " "));

            try {
                var json = JSON.parse(text);
                console.log("   [+] AJAX devolvió JSON válido con éxito.");
                return { type: "ajax", data: json };
            } catch (e) {
                console.log("   [-] AJAX no devolvió JSON directo. Probando método B (GET search)...");
                var searchGetUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
                return fetch(searchGetUrl, { headers: defaultHeaders })
                .then(function(gRes) {
                    console.log("   -> GET Search Status:", gRes.status);
                    return gRes.text().then(function(gHtml) {
                        return { type: "html", data: gHtml };
                    });
                });
            }
        });
    });
})
.then(function(searchResult) {
    var targetAnimeUrl = null;

    if (searchResult.type === "ajax" && typeof searchResult.data === "object") {
        // En temas Dooplay, las keys suelen ser títulos o URLs
        var str = JSON.stringify(searchResult.data);
        var match = str.match(/https?:\\\/\\\/animejara\.com\\\/anime\\\/([a-zA-Z0-9\-_]+)/);
        if (match) targetAnimeUrl = BASE_URL + "/anime/" + match[1];
    } else if (searchResult.type === "html") {
        var hrefMatch = searchResult.data.match(/href=["'](https?:\/\/animejara\.com\/(?:anime|series)\/[^"']+)["']/i);
        if (hrefMatch) targetAnimeUrl = hrefMatch[1];
    }

    if (!targetAnimeUrl) {
        // Fallback para comprobar estructura si la búsqueda no extrae URL directa
        targetAnimeUrl = BASE_URL + "/anime/jujutsu-kaisen";
        console.log("\n[-] No se extrajo URL dinámica del buscador. Usando slug de prueba:", targetAnimeUrl);
    } else {
        console.log("\n[+] Slug del anime encontrado:", targetAnimeUrl);
    }

    console.log("\n=================================================================");
    console.log(">>> PASO 3: AUDITANDO FICHA DEL ANIME Y LISTA DE EPISODIOS <<<");
    console.log("=================================================================");

    return fetch(targetAnimeUrl, { headers: defaultHeaders })
    .then(function(res) {
        console.log("-> Status HTTP Ficha:", res.status);
        return res.text().then(function(html) {
            checkCloudflare(res.headers, html);
            console.log("-> Tamaño HTML Ficha:", html.length);

            // Extracción de episodios
            var epLinks = [];
            var epRegex = /href=["']([^"']*(?:episode|ver|capitulo)[^"']*)["']/gi;
            var m;
            while ((m = epRegex.exec(html)) !== null) {
                if (epLinks.indexOf(m[1]) === -1) epLinks.push(m[1]);
            }

            console.log("-> Enlaces de episodios encontrados (" + epLinks.length + "):");
            console.log(epLinks.slice(0, 5));

            var targetEpUrl = epLinks[0] || (BASE_URL + "/episode/jujutsu-kaisen-1x1/");
            if (targetEpUrl.indexOf("http") !== 0) targetEpUrl = BASE_URL + targetEpUrl;

            return { animeUrl: targetAnimeUrl, epUrl: targetEpUrl };
        });
    });
})
.then(function(paths) {
    console.log("\n=================================================================");
    console.log(">>> PASO 4: AUDITANDO PÁGINA DEL EPISODIO Y SERVIDORES <<<");
    console.log("=================================================================");
    console.log("Descargando episodio:", paths.epUrl);

    var epHeaders = {
        "User-Agent": USER_AGENT,
        "Referer": paths.animeUrl,
        "Accept": defaultHeaders.Accept
    };

    return fetch(paths.epUrl, { headers: epHeaders })
    .then(function(res) {
        console.log("-> Status HTTP Episodio:", res.status);
        return res.text().then(function(html) {
            checkCloudflare(res.headers, html);
            console.log("-> Tamaño HTML Episodio:", html.length);

            // Buscar iframes
            var iframes = [];
            var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
            var im;
            while ((im = ifRegex.exec(html)) !== null) {
                if (iframes.indexOf(im[1]) === -1) iframes.push(im[1]);
            }
            console.log("\n[+] Iframes directos encontrados:", iframes);

            // Buscar llamadas Dooplay doo_player_ajax (data-post / data-nume)
            var playerMatches = [];
            var dooplayRegex = /data-post=["'](\d+)["'][^>]*data-nume=["'](\d+)["']/gi;
            var dm;
            while ((dm = dooplayRegex.exec(html)) !== null) {
                playerMatches.push({ post: dm[1], num: dm[2] });
            }
            console.log("[+] Botones del reproductor Dooplay detectados:", playerMatches);

            console.log("\n=== FIN DE LA INSPECCIÓN TÉCNICA ===");
        });
    });
})
.catch(function(err) {
    console.error("\n[-] ERROR CRÍTICO DURANTE LA INSPECCIÓN:", err.message);
});
