/**
 * Prueba de parámetros para el reproductor de FastApi
 * Ejecución: node providers/inspect_player_params.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://lamovie.org/peliculas/deadpool-wolverine-2024/"
};

var postId = 19173;
var postSlug = "deadpool-wolverine-2024";
var tmdbId = 533535;

var tests = [
    { name: "id + type", url: "https://lamovie.org/wp-api/v1/player?id=" + postId + "&type=movies" },
    { name: "post_id", url: "https://lamovie.org/wp-api/v1/player?post_id=" + postId },
    { name: "post_id + type", url: "https://lamovie.org/wp-api/v1/player?post_id=" + postId + "&type=movies" },
    { name: "slug", url: "https://lamovie.org/wp-api/v1/player?slug=" + postSlug },
    { name: "slug + type", url: "https://lamovie.org/wp-api/v1/player?slug=" + postSlug + "&type=movies" },
    { name: "tmdb", url: "https://lamovie.org/wp-api/v1/player?tmdb=" + tmdbId },
    { name: "tmdb_id", url: "https://lamovie.org/wp-api/v1/player?tmdb_id=" + tmdbId },
    { name: "Cinecalidad (id)", url: "https://cinecalidad.org/wp-api/v1/player?id=" + postId + "&type=movies" }
];

function runTest(idx) {
    if (idx >= tests.length) return;
    var t = tests[idx];

    fetch(t.url, { headers: headers })
        .then(function(r) { return r.json(); })
        .then(function(json) {
            console.log("\n=======================================================");
            console.log("Probando:", t.name);
            console.log("URL:", t.url);
            console.log("Respuesta completa:");
            console.log(JSON.stringify(json, null, 2).substring(0, 500) + "...");
            runTest(idx + 1);
        })
        .catch(function(err) {
            console.log("[-] Error en " + t.name + ":", err.message);
            runTest(idx + 1);
        });
}

runTest(0);
