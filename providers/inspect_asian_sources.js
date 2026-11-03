/**
 * Test de RiveStream y Basement para dramas asiáticos
 * Ejecución: node providers/inspect_asian_sources.js 106617 tv 1 1
 */

var tmdbId = process.argv[2] || "106617"; // Heroes (2020)
var mediaType = process.argv[3] || "tv";
var season = process.argv[4] || "1";
var episode = process.argv[5] || "1";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

console.log("=================================================================");
console.log(">>> [1/2] AUDITANDO API DE RIVESTREAM (asiacloud / direct) <<<");
console.log("=================================================================");

var riveApiUrl = "https://scrapper.rivestream.app/api/provider?provider=asiacloud" +
                 "&id=" + tmdbId + 
                 "&season=" + season + 
                 "&episode=" + episode + 
                 "&type=" + mediaType;

console.log("Consultando endpoint:", riveApiUrl);

fetch(riveApiUrl, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://www.rivestream.app/",
        "Origin": "https://www.rivestream.app"
    }
})
.then(function(res) {
    console.log("-> Status HTTP Rive:", res.status, res.statusText);
    return res.text();
})
.then(function(text) {
    try {
        var json = JSON.parse(text);
        console.log("[+] Respuesta JSON de RiveStream:");
        console.log(JSON.stringify(json, null, 2).substring(0, 500) + "...\n");
    } catch (e) {
        console.log("[-] Respuesta no JSON de Rive:", text.substring(0, 200));
    }

    console.log("=================================================================");
    console.log(">>> [2/2] AUDITANDO BASEMENT / P-STREAM (be.basementx.lol) <<<");
    console.log("=================================================================");

    var basementUrl = "https://be.basementx.lol/scrape?id=" + tmdbId + 
                      "&type=" + mediaType + 
                      "&season=" + season + 
                      "&episode=" + episode;

    console.log("Consultando endpoint:", basementUrl);

    return fetch(basementUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": "https://basementx.lol/"
        }
    })
    .then(function(bRes) {
        console.log("-> Status HTTP Basement:", bRes.status, bRes.statusText);
        return bRes.text();
    })
    .then(function(bText) {
        try {
            var bJson = JSON.parse(bText);
            console.log("[+] Respuesta JSON de Basement:");
            console.log(JSON.stringify(bJson, null, 2).substring(0, 500) + "...\n");
        } catch (e) {
            console.log("[-] Muestra Basement:", bText.substring(0, 200));
        }
    });
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
