/**
 * Inspección profunda de los 452 bytes de StreamWish (hglink.to)
 * Ejecución: node providers/inspect_sololatino.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var wishUrl = "https://hglink.to/e/z773lo7bqkb2";

console.log("=================================================================");
console.log(">>> [TEST A] PROBANDO STREAMWISH CON REFERER EMBED69 <<<");
console.log("=================================================================");

fetch(wishUrl, {
    headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://embed69.org/"
    },
    redirect: "follow"
})
.then(function(r) { return r.text(); })
.then(function(html) {
    console.log("-> Bytes recibidos con Referer embed69:", html.length);
    console.log("\n-> CONTENIDO COMPLETO DE LA RESPUESTA:");
    console.log("-----------------------------------------------------------------");
    console.log(html);
    console.log("-----------------------------------------------------------------");

    // Si sigue dando 452 bytes, probar con Referer sololatino.net
    if (html.length < 1000) {
        console.log("\n=================================================================");
        console.log(">>> [TEST B] PROBANDO STREAMWISH CON REFERER SOLOLATINO.NET <<<");
        console.log("=================================================================");

        return fetch(wishUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": "https://sololatino.net/"
            },
            redirect: "follow"
        })
        .then(function(r2) { return r2.text(); })
        .then(function(html2) {
            console.log("-> Bytes recibidos con Referer sololatino:", html2.length);
            if (html2.length > 1000) {
                console.log("[+] ¡EL REFERER CORRECTO ERA sololatino.net! Tamaño:", html2.length);
            }
        });
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
