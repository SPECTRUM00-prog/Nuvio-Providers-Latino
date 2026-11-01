/**
 * Diagnóstico de conexión a player.peliserieshoy.com
 * Ejecución: node providers/inspect_sololatino.js
 */

var IMDB_ID = "tt0327597";
var TARGET_URL = "https://player.peliserieshoy.com/" + IMDB_ID;
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

console.log("=================================================================");
console.log(">>> DIAGNOSTICANDO CAUSA DE ERROR EN NODE.JS <<<");
console.log("=================================================================\n");

fetch(TARGET_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://sololatino.net/"
    }
})
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(html) {
    console.log("[+] Conexión exitosa. Tamaño recibido:", html.length, "bytes");
})
.catch(function(err) {
    console.error("[-] ERROR PRINCIPAL:", err.message);
    if (err.cause) {
        console.error("[-] CAUSA DETALLADA (err.cause):", err.cause);
    }
});
