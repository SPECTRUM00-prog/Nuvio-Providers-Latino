/**
 * Inspección del reproductor y detalle del post para FastApi
 * Ejecución: node providers/inspect_post_player.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://lamovie.org/"
};

function fetchJson(url) {
    return fetch(url, { headers: headers })
        .then(function(r) { return r.json(); })
        .catch(function(e) { return { error: true, msg: e.message }; });
}

console.log("=================================================================");
console.log(">>> PASO 1: INSPECCIONANDO OBJETO POST DE FASTAPI <<<");
console.log("=================================================================");

fetchJson("https://lamovie.org/wp-api/v1/search?q=deadpool")
.then(function(res) {
    var post = res.data && res.data.posts && res.data.posts[0];
    if (!post) {
        console.log("[-] No se encontró post.");
        return null;
    }

    console.log("[+] Estructura completa de post[0]:");
    console.log(JSON.stringify(post, null, 2));

    var postId = post._id || post.id || 19173;
    var postSlug = post.slug || "deadpool-wolverine-2024";

    console.log("\n=================================================================");
    console.log(">>> PASO 2: PROBANDO ENDPOINTS DEL REPRODUCTOR (ID: " + postId + ") <<<");
    console.log("=================================================================");

    var endpointsToTest = [
        "https://lamovie.org/wp-api/v1/post/" + postId,
        "https://lamovie.org/wp-api/v1/posts/" + postId,
        "https://lamovie.org/wp-api/v1/player/" + postId,
        "https://lamovie.org/wp-api/v1/player?id=" + postId,
        "https://lamovie.org/wp-api/v1/links/" + postId,
        "https://lamovie.org/wp-api/v1/links?id=" + postId,
        "https://lamovie.org/wp-api/v1/servers/" + postId,
        "https://lamovie.org/wp-json/wpf/v1/post/" + postId,
        "https://lamovie.org/wp-json/wpf/v1/player/" + postId
    ];

    var testNext = function(idx) {
        if (idx >= endpointsToTest.length) return Promise.resolve();
        var url = endpointsToTest[idx];

        return fetch(url, { headers: headers })
            .then(function(r) {
                return r.text().then(function(txt) {
                    var isOk = r.status === 200;
                    var sample = txt.substring(0, 180).replace(/\r?\n\s*/g, " ");
                    console.log("[" + r.status + "] " + url);
                    if (isOk) {
                        console.log("    [+] ¡RESPUESTA POSITIVA!: " + sample + "...\n");
                    }
                    return testNext(idx + 1);
                });
            })
            .catch(function(err) {
                console.log("[-] Error en " + url + ": " + err.message);
                return testNext(idx + 1);
            });
    };

    return testNext(0);
})
.then(function() {
    console.log("=================================================================");
    console.log(">>> PASO 3: REVISANDO RUTAS REGISTRADAS EN WPF/V1 <<<");
    console.log("=================================================================");

    return fetchJson("https://lamovie.org/wp-json/wpf/v1")
    .then(function(indexJson) {
        if (indexJson && indexJson.routes) {
            console.log("[+] Rutas oficiales de wpf/v1 en el servidor:");
            console.log(Object.keys(indexJson.routes));
        }
    });
});
