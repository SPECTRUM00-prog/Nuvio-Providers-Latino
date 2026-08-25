/**
 * Inspección del Multiplayer de AnimeJara y Extracción de ID de Serie
 * Ejecutar con: node inspect_multiplayer.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectMultiplayer() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] INSPECCIONANDO REPRODUCTOR MULTIPLAYER (STREAMHJ.TOP)`);
    console.log(`================================================================\n`);

    const playerUrl = "https://multiplayer.streamhj.top/player/multiplayer/embed.php?idanime=1292&idcapitulo=1";

    try {
        const res = await fetch(playerUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": `${BASE_URL}/`,
                "Origin": BASE_URL
            }
        });

        console.log(`Status Multiplayer: ${res.status} ${res.statusText}`);
        const html = await res.text();
        console.log(`Tamaño HTML Multiplayer: ${html.length} caracteres\n`);

        // 1. Buscar pestañas de idiomas (SUB, LAT, CAS)
        const tabs = html.match(/<(?:button|li|div|a)[^>]+(?:data-lang|data-tipo|data-server|class=["'][^"']*tab)[^>]*>[\s\S]*?<\/(?:button|li|div|a)>/gi) || [];
        console.log(`Pestañas / Botones de idioma encontrados (${tabs.length}):`);
        tabs.slice(0, 8).forEach(t => console.log("  Tab:", t.replace(/\s+/g, " ")));

        // 2. Buscar iframes y servidores (VidHide, StreamWish, MP4Upload, etc.)
        const iframes = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
        console.log(`\nIframes en el reproductor (${iframes.length}):`, iframes);

        // 3. Buscar variables de JavaScript (arrays de servidores, URLs base64, etc.)
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log(`\nTotal de scripts en Multiplayer: ${scripts.length}`);
        scripts.forEach((s, idx) => {
            if (s.includes("server") || s.includes("video") || s.includes("player") || s.includes("iframe") || s.includes("embed") || s.includes("http")) {
                console.log(`\n--- Script #${idx + 1} ---`);
                console.log(s.substring(0, 400));
            }
        });

    } catch (e) {
        console.error("Error en Multiplayer:", e.message);
    }

    console.log(`\n================================================================`);
    console.log(`🔍 [2] EXTRACCIÓN DE ID EN SERIE: https://animejara.com/anime/kimetsu-no-yaiba`);
    console.log(`================================================================\n`);

    try {
        const sRes = await fetch(`${BASE_URL}/anime/kimetsu-no-yaiba`, { headers: { "User-Agent": USER_AGENT } });
        const sHtml = await sRes.text();

        // Buscar variables como ID_ANIME, idanime, post_id, etc.
        const idMatches = sHtml.match(/(?:ANIME_ID|ID_ANIME|idanime|post_id|anime_id|data-id|data-anime)\s*[:=]\s*["']?(\d+)["']?/gi) || [];
        console.log(`IDs encontrados en el HTML de la serie:`, [...new Set(idMatches)]);

        // Buscar si hay llamadas a multiplayer en la serie
        const multiMatches = sHtml.match(/src=["']([^"']*multiplayer[^"']*)["']/gi) || [];
        console.log(`Llamadas a multiplayer en serie:`, multiMatches);

    } catch (e) {
        console.error("Error Serie:", e.message);
    }
}

inspectMultiplayer();
