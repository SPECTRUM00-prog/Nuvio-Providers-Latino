/**
 * Script de auditoría V2 para Cinecalidad (.ec) y LaMovie (.org)
 * Ejecución: node providers/inspect_cinelamovie_v2.js "deadpool" 533535
 */

var query = process.argv[2] || "deadpool";
var tmdbId = process.argv[3] || "533535";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var defaultHeaders = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

function checkCloudflare(headers, html) {
    var isCf = (headers.get("server") || "").toLowerCase().indexOf("cloudflare") !== -1;
    var cfRay = headers.get("cf-ray");
    var hasChallenge = html.indexOf("Just a moment...") !== -1 || html.indexOf("challenge-platform") !== -1;
    return { isCf: isCf, cfRay: cfRay, blocked: hasChallenge };
}

function extractEmbeds(html) {
    var found = [];
    // 1. Iframes directos
    var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    var im;
    while ((im = ifRegex.exec(html)) !== null) {
        found.push({ type: "iframe", url: im[1] });
    }

    // 2. Enlaces Vimeos / Embeds en scripts o atributos data
    var vimeosRegex = /https?:\/\/[a-zA-Z0-9.-]*(?:vimeos|goodstream|embed69|filemoon|streamwish|hlswish|voe)[^\s"'<>]+/gi;
    var vm;
    while ((vm = vimeosRegex.exec(html)) !== null) {
        var u = vm[0].replace(/\\/g, "");
        if (found.map(function(x){ return x.url; }).indexOf(u) === -1) {
            found.push({ type: "direct", url: u });
        }
    }

    // 3. Atributos data-url / data-link
    var dataRegex = /data-(?:url|link|player|embed)=["']([^"']+)["']/gi;
    var dm;
    while ((dm = dataRegex.exec(html)) !== null) {
        found.push({ type: "data-attr", url: dm[1] });
    }

    return found;
}

// ==========================================
// 1. AUDITAR CINECALIDAD.EC
// ==========================================
function auditCinecalidad() {
    console.log("=================================================================");
    console.log(">>> [1/2] AUDITANDO CINECALIDAD.EC <<<");
    console.log("=================================================================");

    // Probar si movieron la API a .ec
    var testApiUrl = "https://tmdb.cinecalidad.ec/v1/items/movie/" + tmdbId;
    console.log("[A] Verificando si existe API en:", testApiUrl);

    return fetch(testApiUrl, { headers: defaultHeaders })
    .then(function(res) {
        console.log("   -> Estado API .ec:", res.status, res.statusText);
        if (res.ok) return res.text();
        return null;
    })
    .catch(function() { return null; })
    .then(function(apiBody) {
        if (apiBody) {
            console.log("   [+] ¡La API existe en .ec! Contenido:", apiBody.substring(0, 300));
            return;
        }

        console.log("   [-] No hay subdominio tmdb.cinecalidad.ec. Probando búsqueda web en cinecalidad.ec...");
        var searchUrl = "https://cinecalidad.ec/?s=" + encodeURIComponent(query);
        return fetch(searchUrl, { headers: defaultHeaders })
        .then(function(res) {
            console.log("   -> Estado Búsqueda Web:", res.status);
            return res.text();
        })
        .then(function(html) {
            var cf = checkCloudflare(new Headers(), html);
            console.log("   -> Tamaño HTML Búsqueda:", html.length);
            console.log("   -> Cloudflare Challenge:", cf.blocked ? "¡BLOQUEADO!" : "Limpio");

            // Buscar enlaces a películas
            var links = [];
            var lRegex = /href=["'](https?:\/\/cinecalidad\.ec\/ver-[^"']+)["']/gi;
            var lm;
            while ((lm = lRegex.exec(html)) !== null) {
                if (links.indexOf(lm[1]) === -1) links.push(lm[1]);
            }
            console.log("   -> Fichas encontradas (" + links.length + "):", links.slice(0, 3));

            if (links.length > 0) {
                var targetMovieUrl = links[0];
                console.log("\n   [+] Descargando ficha de película:", targetMovieUrl);
                return fetch(targetMovieUrl, { headers: defaultHeaders })
                .then(function(r) { return r.text(); })
                .then(function(movieHtml) {
                    var embeds = extractEmbeds(movieHtml);
                    console.log("   [+] Reproductores detectados en Cinecalidad (" + embeds.length + "):");
                    console.log(embeds.slice(0, 5));
                });
            }
        });
    })
    .catch(function(err) {
        console.log("   [-] Error auditando Cinecalidad:", err.message);
    });
}

// ==========================================
// 2. AUDITAR LAMOVIE.ORG
// ==========================================
function auditLaMovie() {
    console.log("\n=================================================================");
    console.log(">>> [2/2] AUDITANDO LAMOVIE.ORG <<<");
    console.log("=================================================================");

    var webUrl = "https://lamovie.org/?s=" + encodeURIComponent(query);
    console.log("[A] Probando búsqueda en:", webUrl);

    return fetch(webUrl, { headers: defaultHeaders })
    .then(function(res) {
        console.log("   -> Status HTTP Búsqueda:", res.status);
        return res.text();
    })
    .then(function(html) {
        var cf = checkCloudflare(new Headers(), html);
        console.log("   -> Tamaño HTML Búsqueda:", html.length);
        console.log("   -> Cloudflare Challenge:", cf.blocked ? "¡BLOQUEADO!" : "Limpio");

        var links = [];
        var lRegex = /href=["'](https?:\/\/lamovie\.org\/(?:pelicula|serie)\/[^"']+)["']/gi;
        var lm;
        while ((lm = lRegex.exec(html)) !== null) {
            if (links.indexOf(lm[1]) === -1) links.push(lm[1]);
        }
        console.log("   -> Fichas encontradas (" + links.length + "):", links.slice(0, 3));

        if (links.length > 0) {
            var targetUrl = links[0];
            console.log("\n   [+] Descargando ficha:", targetUrl);
            return fetch(targetUrl, { headers: defaultHeaders })
            .then(function(r) { return r.text(); })
            .then(function(pageHtml) {
                var embeds = extractEmbeds(pageHtml);
                console.log("   [+] Reproductores detectados en LaMovie (" + embeds.length + "):");
                console.log(embeds.slice(0, 5));
            });
        }
    })
    .catch(function(err) {
        console.log("   [-] Error auditando LaMovie:", err.message);
    });
}

auditCinecalidad()
    .then(function() { return auditLaMovie(); })
    .then(function() {
        console.log("\n=================================================================");
        console.log(">>> AUDITORÍA V2 FINALIZADA <<<");
        console.log("=================================================================");
    });
