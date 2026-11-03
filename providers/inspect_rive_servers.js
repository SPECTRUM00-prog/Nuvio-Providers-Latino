/**
 * Sondeo de servidores en RiveStream
 * Ejecución: node providers/inspect_rive_servers.js 106617 tv 1 1
 */

var tmdbId = process.argv[2] || "106617";
var mediaType = process.argv[3] || "tv";
var season = process.argv[4] || "1";
var episode = process.argv[5] || "1";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = {
    "User-Agent": USER_AGENT,
    "Referer": "https://www.rivestream.app/",
    "Origin": "https://www.rivestream.app"
};

// Lista de providers conocidos de RiveStream
var providers = [
    "server3", 
    "citadel", 
    "primevids", 
    "apex", 
    "wholesome", 
    "auto", 
    "zenith", 
    "nova", 
    "ee3"
];

console.log("=================================================================");
console.log(">>> PROBANDO SERVIDORES DE RIVESTREAM PARA TMDB " + tmdbId + " <<<");
console.log("=================================================================\n");

function testProvider(idx) {
    if (idx >= providers.length) {
        console.log("=== FIN DEL SONDEO DE RIVE ===");
        return;
    }

    var prov = providers[idx];
    var url = "https://scrapper.rivestream.app/api/provider?provider=" + prov +
              "&id=" + tmdbId + 
              "&season=" + season + 
              "&episode=" + episode + 
              "&type=" + mediaType;

    fetch(url, { headers: headers })
    .then(function(res) {
        return res.text().then(function(text) {
            try {
                var json = JSON.parse(text);
                var hasData = json && json.data && json.data !== null;
                console.log("[" + res.status + "] Provider [" + prov.toUpperCase() + "]:", hasData ? "¡DATOS ENCONTRADOS!" : "null");
                if (hasData) {
                    console.log("     Muestra:", JSON.stringify(json.data, null, 2).substring(0, 300) + "...\n");
                }
            } catch(e) {
                console.log("[" + res.status + "] Provider [" + prov.toUpperCase() + "]: Error parseando JSON");
            }
            testProvider(idx + 1);
        });
    })
    .catch(function(err) {
        console.log("[-] Error en " + prov + ":", err.message);
        testProvider(idx + 1);
    });
}

testProvider(0);
