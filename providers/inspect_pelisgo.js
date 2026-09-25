/**
 * Extractor del endpoint de reproducción en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var CHUNK_URL = BASE_URL + "/_next/static/chunks/b1469352088ffdf4.js";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Descargando chunk del reproductor:", CHUNK_URL);

fetch(CHUNK_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": BASE_URL + "/"
    }
})
.then(function(res) { return res.text(); })
.then(function(code) {
    console.log("-> Tamaño del chunk:", code.length, "caracteres.\n");

    // 1. Buscar llamadas a fetch en el componente
    var fetchMatches = code.match(/fetch\(["'`][^"'`]+["'`]/gi) || [];
    console.log("[+] Peticiones fetch detectadas en el componente:");
    console.log(fetchMatches);

    // 2. Buscar rutas relativas que contengan api, player, stream, etc.
    var routeMatches = code.match(/["'`](\/api\/[^"'`\s<>]+|api\/[^"'`\s<>]+)["'`]/gi) || [];
    console.log("\n[+] Rutas de API en el reproductor:");
    console.log([...new Set(routeMatches)]);

    // 3. Probar si el endpoint de reproductor usa movieId
    var testMovieId = "cmmxiudf3033gje4ludbighql";
    var possibleEndpoints = [
        BASE_URL + "/api/player?id=" + testMovieId,
        BASE_URL + "/api/player?movieId=" + testMovieId,
        BASE_URL + "/api/movies/" + testMovieId + "/player",
        BASE_URL + "/api/player/" + testMovieId,
        BASE_URL + "/api/stream/" + testMovieId
    ];

    console.log("\n[*] Probando posibles endpoints de video con el movieId...");

    function tryNext(idx) {
        if (idx >= possibleEndpoints.length) {
            console.log("[-] Fin de las pruebas directas.");
            return;
        }

        var ep = possibleEndpoints[idx];
        return fetch(ep, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica"
            }
        })
        .then(function(r) {
            console.log("   -> Probando [" + r.status + "]: " + ep);
            if (r.status === 200) {
                return r.text().then(function(t) {
                    console.log("\n[!!!] ¡ENDPOINT DEL REPRODUCTOR ENCONTRADO! [!!!]");
                    console.log(t.substring(0, 500));
                });
            } else {
                return tryNext(idx + 1);
            }
        })
        .catch(function() {
            return tryNext(idx + 1);
        });
    }

    return tryNext(0);
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
