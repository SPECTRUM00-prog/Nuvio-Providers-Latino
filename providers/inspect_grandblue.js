/**
 * Inspección directa de Grand Blue 3x8
 * Ejecutar con: node inspect_grandblue.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const targetUrl = "https://animejara.com/episode/grand-blue-3x8/";

async function inspectGrandBlue() {
    console.log(`\n================================================================`);
    console.log(`🔍 CONSULTANDO DIRECTO: ${targetUrl}`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://animejara.com/"
            }
        });

        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Buscar todas las referencias a multiplayer o iframes
        const iframes = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
        console.log(`\nIframes en la página (${iframes.length}):`, iframes);

        // 2. Buscar URLs de streamhj o multiplayer
        const multiMatches = html.match(/https?:\/\/[^"'\s<>]*streamhj[^"'\s<>]*/gi) || [];
        console.log(`\nEnlaces a streamhj detectados (${multiMatches.length}):`, [...new Set(multiMatches)]);

        // 3. Buscar idanime
        const idMatches = html.match(/idanime=(\d+)/gi) || [];
        console.log(`\nIDs idanime encontrados:`, [...new Set(idMatches)]);

        // 4. Si hay multiplayer, probarlo directamente
        if (multiMatches.length > 0) {
            const playerUrl = multiMatches[0].replace(/&amp;/g, "&").replace(/&#038;/g, "&");
            console.log(`\nProbando Player URL: ${playerUrl}`);

            const pRes = await fetch(playerUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": "https://animejara.com/",
                    "Origin": "https://animejara.com"
                }
            });
            const pHtml = await pRes.text();
            console.log(`Player Status: ${pRes.status} (${pHtml.length} bytes)`);

            const playMatches = pHtml.match(/playVideo\((?:&quot;|["'])(https?:\/\/[^"'\s&]+)(?:&quot;|["'])\)/gi) || [];
            console.log(`Servidores extraídos en multiplayer (${playMatches.length}):`);
            playMatches.forEach(p => console.log("  ▶", p));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectGrandBlue();
