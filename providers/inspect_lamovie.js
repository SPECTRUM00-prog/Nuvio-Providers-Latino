/**
 * Script de auditoría para LaMovie (API REST wp-api/v1)
 * Uso: node providers/inspect_lamovie.js "Oppenheimer" movie
 *       node providers/inspect_lamovie.js "Breaking Bad" tv
 */

var query = process.argv[2] || "Oppenheimer";
var mediaType = process.argv[3] || "movie";
var isTv = mediaType === "tv" || mediaType === "series";

var BASE_URL = "https://lamovie.org";
var FAST_API = BASE_URL + "/wp-api/v1";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITANDO LAMOVIE: \"" + query + "\" (" + (isTv ? "SERIE" : "PELÍCULA") + ")");
console.log("==================================================\n");

// 1. Diagnóstico de conectividad base
console.log("[1] Verificando estado del dominio base (" + BASE_URL + ")...");
fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
    .then(function(res) {
        var cfRay = res.headers.get("cf-ray");
        var cfMitigated = res.headers.get("cf-mitigated");
        console.log("-> Status Base HTTP:", res.status, res.statusText);
        console.log("-> Servidor:", res.headers.get("server") || "Desconocido");
        if (cfMitigated || res.status === 403 || res.status === 503) {
            console.log("[!] ADVERTENCIA: Cloudflare o reto interactivo detectado en la raíz.");
        } else {
            console.log("[+] Conexión directa accesible (sin bloqueo inmediato).");
        }

        // 2. Probar API de Búsqueda
        var searchUrl = FAST_API + "/search?postType=any&q=" + encodeURIComponent(query) + "&postsPerPage=5";
        console.log("\n[2] Consultando API de Búsqueda:", searchUrl);

        return fetch(searchUrl, { headers: headers });
    })
    .then(function(res) {
        console.log("-> Status API Search:", res.status, res.statusText);
        return res.text();
    })
    .then(function(text) {
        console.log("-> Tamaño de respuesta:", text.length, "caracteres.");

        var json = null;
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.log("[-] La búsqueda no devolvió JSON válido. Primeros 200 caracteres:");
            console.log(text.substring(0, 200));
            return;
        }

        var posts = (json && json.data && json.data.posts) || (json && json.posts) || [];
        console.log("\n[+] Títulos encontrados en la API (" + posts.length + "):");
        for (var i = 0; i < posts.length; i++) {
            var p = posts[i];
            console.log("   [" + (i + 1) + "] ID: " + (p._id || p.id) + " | Título: " + (p.title || p.name) + " | Tipo: " + (p.post_type || p.type || "N/A"));
        }

        if (posts.length === 0) {
            console.log("[-] No hay resultados para inspeccionar el reproductor.");
            return;
        }

        var firstPost = posts[0];
        var mainId = firstPost._id || firstPost.id;

        // 3. Probar reproductor (Película vs Serie)
        if (!isTv) {
            var playerUrl = FAST_API + "/player?postId=" + mainId + "&demo=0";
            console.log("\n[3] Consultando reproductor de película:", playerUrl);

            return fetch(playerUrl, { headers: headers })
                .then(function(r) { return r.json(); })
                .then(function(pJson) {
                    var embeds = (pJson && pJson.data && pJson.data.embeds) || (pJson && pJson.embeds) || [];
                    console.log("[+] Embeds recibidos (" + embeds.length + "):");
                    console.log(JSON.stringify(embeds, null, 2).substring(0, 800));
                });
        } else {
            var epListUrl = FAST_API + "/single/episodes/list?_id=" + mainId + "&season=1&page=1&postsPerPage=5";
            console.log("\n[3] Consultando lista de episodios de serie (T1):", epListUrl);

            return fetch(epListUrl, { headers: headers })
                .then(function(r) { return r.json(); })
                .then(function(epJson) {
                    var epPosts = (epJson && epJson.data && epJson.data.posts) || (epJson && epJson.posts) || [];
                    console.log("[+] Episodios encontrados (" + epPosts.length + "):");
                    if (epPosts.length > 0) {
                        var firstEp = epPosts[0];
                        console.log("   Primer episodio detectado: Ep " + (firstEp.episode || firstEp.number) + " (ID: " + (firstEp._id || firstEp.id) + ")");

                        var epPlayerUrl = FAST_API + "/player?postId=" + (firstEp._id || firstEp.id) + "&demo=0";
                        console.log("\n[4] Consultando reproductor del episodio:", epPlayerUrl);
                        return fetch(epPlayerUrl, { headers: headers })
                            .then(function(pr) { return pr.json(); })
                            .then(function(prJson) {
                                var epEmbeds = (prJson && prJson.data && prJson.data.embeds) || (prJson && prJson.embeds) || [];
                                console.log("[+] Embeds del episodio (" + epEmbeds.length + "):");
                                console.log(JSON.stringify(epEmbeds, null, 2).substring(0, 800));
                            });
                    }
                });
        }
    })
    .catch(function(err) {
        console.error("[-] Error en la auditoría:", err.message);
    });
