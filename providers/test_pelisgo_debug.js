/**
 * Diagnóstico paso a paso de PelisGO
 * Ejecución: node providers/test_pelisgo_debug.js 872585 movie
 *             node providers/test_pelisgo_debug.js 1149947 movie
 *             node providers/test_pelisgo_debug.js 1396 tv 1 1
 */

var tmdbId = process.argv[2] || "872585";
var mediaType = process.argv[3] || "movie";
var seasonNum = process.argv[4] || "1";
var episodeNum = process.argv[5] || "1";
var isTv = mediaType === "tv" || mediaType === "series";

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("==================================================");
console.log("[*] DIAGNÓSTICO PELISGO: TMDB " + tmdbId + " (" + mediaType + ")");
console.log("==================================================\n");

// PASO 1: TMDB
var tmdbUrl = "https://api.themoviedb.org/3/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX";
console.log("[1] Consultando TMDB:", tmdbUrl);

fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(meta) {
        var title = meta.name || meta.title;
        console.log("-> Título TMDB:", title);

        // PASO 2: BÚSQUEDA PELISGO
        var searchUrl = BASE_URL + "/search?q=" + encodeURIComponent(title);
        console.log("\n[2] Consultando buscador de PelisGO:", searchUrl);
        return fetch(searchUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } })
            .then(function(r) { return r.text(); })
            .then(function(searchHtml) {
                var pattern = isTv ? /href=["'](\/series\/[^"'\s<>]+)["']/gi : /href=["'](\/movies\/[^"'\s<>]+)["']/gi;
                var slugs = [];
                var m;
                while ((m = pattern.exec(searchHtml)) !== null) {
                    var s = m[1].replace("/movies/", "").replace("/series/", "").replace(/\/$/, "");
                    if (slugs.indexOf(s) === -1) slugs.push(s);
                }
                console.log("-> Slugs devueltos por el buscador:", slugs);

                if (slugs.length === 0) {
                    console.log("[-] El buscador no devolvió ningún slug para este título.");
                    return;
                }

                // PASO 3: PÁGINA DEL CONTENIDO
                var targetSlug = slugs[0];
                var pageUrl = isTv ? 
                    (BASE_URL + "/series/" + targetSlug + "/temporada/" + seasonNum + "/episodio/" + episodeNum) :
                    (BASE_URL + "/movies/" + targetSlug);

                console.log("\n[3] Descargando página del contenido:", pageUrl);
                return fetch(pageUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" } })
                    .then(function(r) { return r.text(); })
                    .then(function(html) {
                        console.log("-> Tamaño HTML recibido:", html.length);

                        // PASO 4: EXTRAER ID
                        var idMatch = isTv ?
                            (html.match(/\\?"episodeId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i) || html.match(/episodeId\s*:\s*["']([^"']+)["']/i)) :
                            (html.match(/\\?"movieId\\?"\s*:\s*\\?"([^"\\s]+)\\?"/i) || html.match(/movieId\s*:\s*["']([^"']+)["']/i));

                        var entityId = idMatch ? idMatch[1] : null;
                        console.log("\n[4] ID extraído:", entityId);

                        if (!entityId) {
                            console.log("[-] No se pudo extraer el ID del HTML.");
                            return;
                        }

                        // PASO 5: CONSULTAR API DE STREAMS
                        var streamApi = isTv ?
                            (BASE_URL + "/api/series/episode/" + entityId + "/stream") :
                            (BASE_URL + "/api/movies/" + entityId + "/stream");

                        console.log("\n[5] Consultando API de streams:", streamApi);
                        return fetch(streamApi, {
                            headers: { "User-Agent": USER_AGENT, "Accept": "application/json", "Referer": pageUrl }
                        })
                        .then(function(r) { return r.json(); })
                        .then(function(json) {
                            var links = json.links || [];
                            console.log("-> Enlaces devueltos por la API (" + links.length + "):");
                            links.forEach(function(l, i) {
                                console.log("   [" + (i + 1) + "] Servidor: " + (l.server || l.name) + " -> " + l.url);
                            });

                            // PASO 6: PROBAR EL PRIMER RESOLVER
                            if (links.length > 0) {
                                var firstLink = links[0];
                                console.log("\n[6] Probando resolver para el primer enlace:", firstLink.url);

                                return fetch(firstLink.url, {
                                    headers: { "User-Agent": USER_AGENT, "Referer": firstLink.url },
                                    redirect: "follow"
                                })
                                .then(function(res) {
                                    console.log("-> Status HTTP del reproductor:", res.status);
                                    return res.text();
                                })
                                .then(function(t) {
                                    console.log("-> Tamaño HTML del reproductor:", t.length);
                                    var m3u8 = t.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                                    console.log("-> ¿Encontró m3u8 directo?:", m3u8 ? m3u8[0].substring(0, 80) + "..." : "No");
                                });
                            }
                        });
                    });
            });
    })
    .catch(function(err) {
        console.error("[-] Error en diagnóstico:", err.message);
    });
