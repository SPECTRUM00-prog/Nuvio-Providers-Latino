/**
 * Test de Series y Episodios en CineCalidad LITE
 */

var API_BASE = "https://tmdb.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Buscando serie 'Breaking Bad' (TMDB 1396)...");

fetch(API_BASE + "/v1/search?q=Breaking%20Bad", {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
})
.then(function(res) { return res.json(); })
.then(function(json) {
    var items = json.items || [];
    console.log("[+] Series encontradas:", items.length);

    // Buscar la que coincida con kind: 'tv' o tmdb_id: 1396
    var tvItem = null;
    for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "tv" || items[i].tmdb_id === 1396) {
            tvItem = items[i];
            break;
        }
    }

    if (!tvItem) {
        console.log("[-] No se encontró la serie en el resultado.");
        return;
    }

    console.log("\n[+] Ficha de la Serie encontrada:");
    console.log({
        title: tvItem.title,
        tmdb_id: tvItem.tmdb_id,
        kind: tvItem.kind,
        slug: tvItem.slug,
        available_seasons: tvItem.available_seasons
    });

    // Probar posibles endpoints de episodios
    var testUrls = [
        API_BASE + "/v1/items/" + tvItem.slug,
        API_BASE + "/v1/items/" + tvItem.tmdb_id,
        API_BASE + "/v1/items/tv/" + tvItem.tmdb_id,
        API_BASE + "/v1/items/tv/" + tvItem.slug,
        API_BASE + "/v1/items/" + tvItem.slug + "/1/1",
        API_BASE + "/v1/cards/tv/" + tvItem.slug
    ];

    console.log("\n[*] Buscando endpoint de temporadas y episodios...");

    function tryNext(idx) {
        if (idx >= testUrls.length) {
            console.log("[-] Ningún endpoint de prueba respondió JSON.");
            return;
        }
        var target = testUrls[idx];
        return fetch(target, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        })
        .then(function(r) {
            if (r.status === 200) {
                return r.json().then(function(data) {
                    console.log("\n[!!!] ENDPOINT VÁLIDO ENCONTRADO:", target);
                    console.log(JSON.stringify(data, null, 2).substring(0, 1000));
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
    console.error("Error:", err.message);
});
