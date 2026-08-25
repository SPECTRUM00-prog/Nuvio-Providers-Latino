/**
 * Volcado de lista de servidores y botones en Multiplayer
 * Ejecutar con: node inspect_buttons.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function dumpButtons() {
    const urls = [
        "https://multiplayer.streamhj.top/player/multiplayer/embed.php?idanime=1292&idcapitulo=1",
        "https://multiplayer.streamhj.top/player/multiplayer/embed.php?idanime=88&idcapitulo=1"
    ];

    for (const playerUrl of urls) {
        console.log(`\n================================================================`);
        console.log(`🔍 VOLCANDO SERVIDORES DE: ${playerUrl}`);
        console.log(`================================================================\n`);

        try {
            const res = await fetch(playerUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": `${BASE_URL}/`,
                    "Origin": BASE_URL
                }
            });

            const html = await res.text();
            
            // 1. Extraer todas las llamadas a playVideo('...')
            const playMatches = html.match(/playVideo\(['"]([^'"]+)['"]\)/gi) || [];
            console.log(`Llamadas a playVideo encontradas (${playMatches.length}):`);
            playMatches.forEach(p => console.log("  ▶", p));

            // 2. Extraer fragmento de #lista-server
            const listMatch = html.match(/<div[^>]+id=["']lista-server["'][\s\S]*?<\/div>\s*<\/div>/i) ||
                              html.match(/<ul[^>]+class=["'][^"']*server[^"']*["'][\s\S]*?<\/ul>/i);

            if (listMatch) {
                console.log("\n--- Contenido de Lista de Servidores ---");
                console.log(listMatch[0].substring(0, 1500));
            } else {
                // Buscar cualquier botón o enlace con enlaces http
                const allButtons = html.match(/<(?:button|a|li|div)[^>]+onclick[\s\S]*?<\/(?:button|a|li|div)>/gi) || [];
                console.log(`\nBotones interactivos (${allButtons.length}):`);
                allButtons.slice(0, 10).forEach(b => console.log(" ", b.replace(/\s+/g, " ")));
            }

        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

dumpButtons();
