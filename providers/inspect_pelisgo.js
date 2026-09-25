/**
 * Extractor del contenedor #player y chunks de ClientPlayerSection en PelisGO
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TARGET_URL = "https://pelisgo.online/movies/oppenheimer-el-dilema-de-la-bomba-atomica";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Analizando contenedor #player y chunks...");

fetch(TARGET_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Buscar id="player" o id='player'
    var pIdx = html.indexOf('id="player"');
    if (pIdx === -1) pIdx = html.indexOf("id='player'");
    if (pIdx === -1) pIdx = html.indexOf('player"');

    console.log("[1] Búsqueda de id=\"player\":");
    if (pIdx !== -1) {
        console.log("   [+] ¡Contenedor #player encontrado en la posición " + pIdx + "!");
        var playerHtml = html.substring(Math.max(0, pIdx - 150), pIdx + 1200);
        console.log("   --- FRAGMENTO HTML DE #PLAYER ---");
        console.log(playerHtml);
        console.log("   ---------------------------------");
    } else {
        console.log("   [-] No hay id=\"player\" estático.");
    }

    // 2. Extraer la línea completa donde se declara ClientPlayerSection para ver todos sus chunks
    console.log("\n[2] Lista completa de chunks para ClientPlayerSection:");
    var sectionMatch = html.match(/\[[^\]]*ClientPlayerSection[^\]]*\]/i) || 
                       html.match(/self\.__next_f\.push\(\[1,"[^"]*ClientPlayerSection[^"]*"\)/i);

    if (sectionMatch) {
        console.log(sectionMatch[0]);
    } else {
        var idxCPS = html.indexOf("ClientPlayerSection");
        if (idxCPS !== -1) {
            console.log(html.substring(Math.max(0, idxCPS - 200), idxCPS + 150));
        }
    }

    // 3. Buscar si hay Server Actions (Next-Action IDs) o llamadas de acción en el HTML
    console.log("\n[3] Buscando posibles Server Actions o endpoints en el HTML:");
    var actions = html.match(/["']([a-f0-9]{40,})["']/g) || [];
    console.log("   IDs hash detectados:", actions.slice(0, 5));
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
