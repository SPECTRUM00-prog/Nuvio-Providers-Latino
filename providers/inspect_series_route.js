/**
 * Inspección del endpoint oficial de episodios (/wpf/v1/episodes)
 * Ejecución: node providers/inspect_series_route.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*", "Referer": "https://lamovie.org/" };

console.log("=================================================================");
console.log(">>> [1/2] LEYENDO ESQUEMA OFICIAL DE /wpf/v1/episodes <<<");
console.log("=================================================================");

fetch("https://lamovie.org/wp-json/wpf/v1", { headers: headers })
.then(function(r) { return r.json(); })
.then(function(schema) {
    var epRoute = schema && schema.routes && schema.routes["/wpf/v1/episodes"];
    if (epRoute) {
        console.log("[+] Argumentos y métodos aceptados por /wpf/v1/episodes:");
        console.log(JSON.stringify(epRoute, null, 2));
    } else {
        console.log("[-] No se encontró detalle de /wpf/v1/episodes en el índice.");
    }

    console.log("\n=================================================================");
    console.log(">>> [2/2] BUSCANDO SERIE CONFIRMADA ('Loki') EN FASTAPI <<<");
    console.log("=================================================================");

    return fetch("https://lamovie.org/wp-api/v1/search?q=loki", { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(searchRes) {
        var posts = (searchRes.data && searchRes.data.posts) || [];
        console.log("[+] Resultados encontrados para 'Loki':", posts.length);

        if (posts.length === 0) {
            console.log("[-] No hubo resultados.");
            return;
        }

        var serie = posts[0];
        console.log("    Ficha:", serie.title, "| _id:", serie._id, "| tipo:", serie.type);

        // Probar endpoints con el ID de la serie
        var sId = serie._id;
        var urls = [
            "https://lamovie.org/wp-json/wpf/v1/episodes?id=" + sId,
            "https://lamovie.org/wp-json/wpf/v1/episodes?post_id=" + sId,
            "https://lamovie.org/wp-json/wpf/v1/episodes?postId=" + sId,
            "https://lamovie.org/wp-json/wpf/v1/episodes?id=" + sId + "&season=1",
            "https://lamovie.org/wp-api/v1/player?postId=" + sId + "&season=1&episode=1&demo=0",
            "https://lamovie.org/wp-api/v1/player?postId=" + sId + "&demo=0"
        ];

        function testUrl(idx) {
            if (idx >= urls.length) return;
            var u = urls[idx];
            fetch(u, { headers: headers })
            .then(function(res) {
                return res.text().then(function(txt) {
                    console.log("\n[" + res.status + "] " + u);
                    console.log("Muestra: " + txt.substring(0, 200).replace(/\r?\n\s*/g, " ") + "...");
                    testUrl(idx + 1);
                });
            })
            .catch(function(err) {
                console.log("[-] Error en " + u + ": " + err.message);
                testUrl(idx + 1);
            });
        }

        testUrl(0);
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
