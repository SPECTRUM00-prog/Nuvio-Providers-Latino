/**
 * Extractor de propiedades del componente ClientPlayerSection en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TARGET_URL = "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Descargando y localizando ClientPlayerSection...");

fetch(TARGET_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    var marker = "ClientPlayerSection";
    var idx = html.indexOf(marker);

    if (idx === -1) {
        console.log("[-] No se encontró el marcador ClientPlayerSection.");
        return;
    }

    console.log("[+] ¡Marcador encontrado en la posición " + idx + "!");

    // Extraer 2500 caracteres a partir del marcador
    var chunk = html.substring(idx - 100, idx + 2500);
    console.log("\n--- BLOQUE SERIALIZADO DE REACT (ClientPlayerSection) ---");
    console.log(chunk);
    console.log("---------------------------------------------------------\n");

    // Buscar si hay URLs o embeds dentro de este bloque
    var urlMatches = chunk.match(/https?:\/\/[^"'\s<>\\]+/gi) || [];
    console.log("[+] Enlaces detectados en el bloque del reproductor:", urlMatches);
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
