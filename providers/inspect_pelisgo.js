/**
 * Extractor directo de props de ClientEpisodePlayerSection
 * Ejecución: node providers/inspect_pelisgo.js
 */

var EPISODE_URL = "https://pelisgo.online/series/breaking-bad/temporada/1/episodio/1";
var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Extrayendo props de ClientEpisodePlayerSection...");

fetch(EPISODE_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/series/breaking-bad"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    var marker = "ClientEpisodePlayerSection";
    var pos = html.indexOf(marker);

    if (pos === -1) {
        console.log("[-] No se encontró el marcador.");
        return;
    }

    // Extraer 800 caracteres posteriores a la declaración del componente
    var slice = html.substring(pos, pos + 800);
    console.log("\n--- PROPS SERIALIZADAS DE CLIENTEPISODEPLAYERSECTION ---");
    console.log(slice);
    console.log("--------------------------------------------------------\n");

    // Buscar el identificador dentro del fragmento extraído
    var idMatch = slice.match(/cm[a-zA-Z0-9]{20,}/);
    if (idMatch) {
        var epId = idMatch[0];
        console.log("[+] ID detectado:", epId);

        var streamUrl = BASE_URL + "/api/series/episode/" + epId + "/stream";
        console.log("[*] Probando consulta a:", streamUrl);

        return fetch(streamUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Referer": EPISODE_URL
            }
        })
        .then(function(r) { return r.json(); })
        .then(function(json) {
            console.log("\n[+] RESPUESTA DEL ENDPOINT DE STREAM:");
            console.log(JSON.stringify(json, null, 2));
        });
    } else {
        console.log("[-] No se detectó un identificador 'cm...' en el bloque.");
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
