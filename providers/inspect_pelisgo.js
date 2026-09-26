/**
 * Impresión del código fuente de GoodStream (Flix)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TEST_URL = "https://goodstream.one/e/ddmcxni462sv";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Descargando HTML completo de GoodStream (2,235 caracteres)...");

fetch(TEST_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    console.log("\n--- HTML COMPLETO DE GOODSTREAM ---");
    console.log(html);
    console.log("-----------------------------------\n");
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
