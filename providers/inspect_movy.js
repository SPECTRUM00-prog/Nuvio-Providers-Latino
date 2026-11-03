/**
 * Test de fuentes de Movy / Videasy (api.wecollege.net)
 * Ejecución: node providers/inspect_movy.js 106617 tv 1 1
 */

var tmdbId = process.argv[2] || "106617"; // Heroes (2020)
var mediaType = process.argv[3] || "tv";
var season = process.argv[4] || "1";
var episode = process.argv[5] || "1";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Origin": "https://vidy.st",
    "Referer": "https://vidy.st/"
};

console.log("=================================================================");
console.log(">>> [1/2] OBTENIENDO SEMILLA (SEED) DE api.wecollege.net <<<");
console.log("=================================================================");

var seedUrl = "https://api.wecollege.net/seed?mediaId=" + tmdbId;
console.log("Consultando:", seedUrl);

fetch(seedUrl, { headers: headers })
.then(function(res) { return res.json(); })
.then(function(seedData) {
    console.log("[+] Respuesta Seed:", seedData);
    var seed = seedData.seed;

    if (!seed) {
        console.log("[-] No se pudo obtener el seed.");
        return;
    }

    console.log("\n=================================================================");
    console.log(">>> [2/2] PROBANDO SERVIDORES POR CIUDAD PARA HEROES (2020) <<<");
    console.log("=================================================================");

    var title = encodeURIComponent(encodeURIComponent("Heroes"));
    var year = "2020";
    var imdbId = "tt12793360"; // IMDb de Heroes (2020)

    var cities = ["chicago", "vegas", "cancun", "miami", "boise", "paris"];

    function testCity(idx) {
        if (idx >= cities.length) {
            console.log("\n=== FIN DE PRUEBAS DE CIUDADES ===");
            return;
        }

        var city = cities[idx];
        var sourceUrl = "https://api.wecollege.net/" + city + "/sources?title=" + title + 
                        "&mediaType=" + mediaType + 
                        "&year=" + year + 
                        "&episodeId=" + episode + 
                        "&seasonId=" + season + 
                        "&tmdbId=" + tmdbId + 
                        "&imdbId=" + imdbId + 
                        "&enc=2&seed=" + seed;

        console.log("\n-> Probando servidor [" + city.toUpperCase() + "]...");

        fetch(sourceUrl, { headers: headers })
        .then(function(r) {
            return r.text().then(function(text) {
                console.log("   Status HTTP:", r.status);
                console.log("   Tamaño respuesta:", text.length, "bytes");

                if (text.length > 0) {
                    try {
                        var json = JSON.parse(text);
                        console.log("   [+] ¡JSON parseado!:", JSON.stringify(json, null, 2).substring(0, 300));
                    } catch(e) {
                        console.log("   [i] Respuesta cifrada/raw (primeros 150 caracteres):");
                        console.log("   " + text.substring(0, 150));
                    }
                } else {
                    console.log("   [-] Servidor vacío (no tiene la serie en caché).");
                }
                testCity(idx + 1);
            });
        })
        .catch(function(err) {
            console.log("   [-] Error en ciudad " + city + ":", err.message);
            testCity(idx + 1);
        });
    }

    testCity(0);
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
