/**
 * Localizador de series en FastApi
 * Ejecución: node providers/find_series.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT, "Referer": "https://lamovie.org/" };

var testQueries = ["dragon ball", "one piece", "tronos", "merlina", "rick"];

function searchNext(idx) {
    if (idx >= testQueries.length) {
        console.log("[-] Fin de las pruebas.");
        return;
    }

    var q = testQueries[idx];
    console.log("\n-> Buscando: \"" + q + "\"...");

    fetch("https://lamovie.org/wp-api/v1/search?q=" + encodeURIComponent(q), { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(json) {
        var posts = (json && json.data && json.data.posts) || [];
        console.log("   Resultados:", posts.length);

        for (var i = 0; i < posts.length; i++) {
            var p = posts[i];
            console.log("   - [" + p.type + "] " + p.title + " (ID: " + p._id + ")");
            if (p.type === "tvshows" || p.type === "series" || p.type === "animes") {
                console.log("\n   [+] ¡SERIE / ANIME ENCONTRADO! Probando sus episodios:");
                return testEpisodes(p._id, p.title);
            }
        }
        searchNext(idx + 1);
    })
    .catch(function(err) {
        console.log("[-] Error:", err.message);
        searchNext(idx + 1);
    });
}

function testEpisodes(seriesId, title) {
    var epUrl = "https://lamovie.org/wp-json/wpf/v1/episodes?post_id=" + seriesId;
    console.log("   Consultando:", epUrl);

    fetch(epUrl, { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(epData) {
        console.log("\n=======================================================");
        console.log(">>> ESTRUCTURA REAL DE EPISODIOS PARA: " + title + " <<<");
        console.log("=======================================================");
        console.log(JSON.stringify(epData, null, 2).substring(0, 700) + "...\n");
    })
    .catch(function(e) {
        console.log("[-] Error en episodios:", e.message);
    });
}

searchNext(0);
