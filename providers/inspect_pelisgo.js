/**
 * Extractor del bloque completo de #player en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TARGET_URL = "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Extrayendo sección #player completa...");

fetch(TARGET_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    var pIdx = html.indexOf('id="player"');
    if (pIdx === -1) {
        console.log("[-] No se encontró id=\"player\"");
        return;
    }

    // Extraer 3500 caracteres a partir de id="player"
    var playerSection = html.substring(pIdx, pIdx + 3500);
    console.log("\n--- CONTENIDO INTERNO DE #PLAYER ---");
    console.log(playerSection);
    console.log("------------------------------------\n");

    // Buscar si hay iframes, botones o enlaces dentro de esa sección
    var iframes = playerSection.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
    console.log("[+] Iframes dentro de #player:", iframes);

    var buttons = playerSection.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];
    console.log("[+] Botones dentro de #player (" + buttons.length + "):");
    for (var i = 0; i < Math.min(5, buttons.length); i++) {
        console.log("   ->", buttons[i].replace(/\s+/g, " "));
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
