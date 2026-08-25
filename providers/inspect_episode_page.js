/**
 * Inspección de la página real de episodio en AnimeJara
 * Ejecutar con: node inspect_episode_page.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const url = "https://animejara.com/episode/kimetsu-no-yaiba-1x1/";

async function inspectEpPage() {
    console.log(`\n================================================================`);
    console.log(`🔍 CONSULTANDO PÁGINA DE EPISODIO: ${url}`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://animejara.com/" } });
        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Buscar iframes
        const iframes = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
        console.log(`\nIframes encontrados (${iframes.length}):`, iframes);

        // 2. Buscar llamadas a multiplayer o idanime
        const multiMatches = html.match(/https?:\/\/[^"'\s<>]*multiplayer[^"'\s<>]*/gi) || [];
        console.log(`Multiplayer detectado:`, multiMatches);

        // 3. Buscar llamadas a playVideo
        const playMatches = html.match(/playVideo\((?:&quot;|["'])(https?:\/\/[^"'\s&]+)(?:&quot;|["'])\)/gi) || [];
        console.log(`Servidores playVideo (${playMatches.length}):`, playMatches);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectEpPage();
