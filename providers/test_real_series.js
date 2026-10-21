/**
 * Test de serie confirmada
 * Ejecución: node providers/test_real_series.js
 */

var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://lamovie.org/"
};

console.log("=======================================================");
console.log(">>> BUSCANDO 'The Boys' EN FASTAPI <<<");
console.log("=======================================================");

fetch("https://lamovie.org/wp-api/v1/search?q=the+boys", { headers: headers })
.then(function(r) { return r.json(); })
.then(function(searchRes) {
    var posts = (searchRes.data && searchRes.data.posts) || [];
    var serie = null;
    for (var i = 0; i < posts.length; i++) {
        if (posts[i].type === "tvshows" || posts[i].type === "series") {
            serie = posts[i];
            break;
        }
    }

    if (!serie) serie = posts[0];
    console.log("[+] Ficha encontrada:", serie.title, "| _id:", serie._id, "| type:", serie.type);

    var episodesUrl = "https://lamovie.org/wp-json/wpf/v1/episodes?post_id=" + serie._id;
    console.log("\nConsultando episodios en:", episodesUrl);

    return fetch(episodesUrl, { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(episodesData) {
        console.log("\n=======================================================");
        console.log(">>> ESTRUCTURA DE EPISODIOS DEVUELTA <<<");
        console.log("=======================================================");
        console.log(JSON.stringify(episodesData, null, 2).substring(0, 700) + "...\n");

        // Si devuelve una lista de episodios con su propio ID, probar el reproductor con ese episodio
        var firstEp = null;
        if (Array.isArray(episodesData)) firstEp = episodesData[0];
        else if (episodesData.data && Array.isArray(episodesData.data)) firstEp = episodesData.data[0];
        else if (episodesData.episodes && Array.isArray(episodesData.episodes)) firstEp = episodesData.episodes[0];

        if (firstEp) {
            var epId = firstEp._id || firstEp.id;
            console.log("[+] Probando reproductor para el primer episodio (ID: " + epId + "):");
            var playerUrl = "https://lamovie.org/wp-api/v1/player?postId=" + epId + "&demo=0";
            return fetch(playerUrl, { headers: headers })
                .then(function(pr) { return pr.json(); })
                .then(function(pj) {
                    console.log("Respuesta reproductor del episodio:");
                    console.log(JSON.stringify(pj, null, 2).substring(0, 500) + "...");
                });
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
