/**
 * Test de Flujo Paso a Paso para AnimeJara
 * Ejecutar con: node test_animejara_flow.js
 */

const BASE_URL = "https://animejara.com";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function testFlow() {
    const testCases = [
        { name: "Your Name (Kimi no Na wa)", query: "Kimi no Na wa", isMovie: true, ep: 1 },
        { name: "Kimetsu no Yaiba", query: "Kimetsu no Yaiba", isMovie: false, ep: 1 },
        { name: "Grand Blue", query: "Grand Blue", isMovie: false, ep: 1 }
    ];

    for (const tc of testCases) {
        console.log(`\n================================================================`);
        console.log(`🧪 PROBANDO: ${tc.name} ("${tc.query}")`);
        console.log(`================================================================\n`);

        // 1. Probar búsqueda
        console.log(`[1] Consultando AJAX search...`);
        const searchRes = await fetch(AJAX_URL, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": `${BASE_URL}/`
            },
            body: `action=live_search&s=${encodeURIComponent(tc.query)}`
        });

        const searchJson = await searchRes.json();
        const animes = searchJson?.data?.animes || [];
        console.log(`    Resultados encontrados: ${animes.length}`);
        animes.forEach(a => console.log(`    - [${a.tipo}] ${a.titulo} (slug: ${a.slug})`));

        if (animes.length === 0) continue;

        // 2. Extraer ID del primer anime
        const anime = animes[0];
        const isMovie = (anime.tipo && (anime.tipo.toLowerCase() === "movie" || anime.tipo.toLowerCase() === "pelicula"));
        const animeUrl = `${BASE_URL}${isMovie ? "/movie/" : "/anime/"}${anime.slug}`;
        console.log(`\n[2] Consultando página del anime: ${animeUrl}`);

        const aRes = await fetch(animeUrl, { headers: { "User-Agent": USER_AGENT } });
        const aHtml = await aRes.text();
        console.log(`    HTML recibido: ${aHtml.length} caracteres`);

        // Buscar IDs
        const idMatches = aHtml.match(/(?:ANIME_ID|ID_ANIME|idanime|anime_id|data-id|data-anime)\s*[:=]\s*["']?(\d+)["']?/gi) || [];
        console.log(`    IDs detectados en HTML:`, idMatches);

        let extractedId = null;
        for (const m of idMatches) {
            const num = m.match(/\d+/);
            if (num) { extractedId = num[0]; break; }
        }

        if (!extractedId) {
            console.log("    ❌ No se pudo extraer el ID del anime.");
            continue;
        }

        console.log(`    🎯 ID extraído: ${extractedId}`);

        // 3. Consultar Multiplayer
        const playerUrl = `https://multiplayer.streamhj.top/player/multiplayer/embed.php?idanime=${extractedId}&idcapitulo=${tc.ep}`;
        console.log(`\n[3] Consultando Multiplayer: ${playerUrl}`);

        const pRes = await fetch(playerUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/`, "Origin": BASE_URL }
        });
        const pHtml = await pRes.text();
        console.log(`    Status Multiplayer: ${pRes.status}`);

        // Buscar enlaces playVideo
        const playMatches = pHtml.match(/playVideo\((?:&quot;|["'])(https?:\/\/[^"'\s&]+)(?:&quot;|["'])\)/gi) || [];
        console.log(`    Servidores extraídos (${playMatches.length}):`);
        playMatches.forEach(p => console.log(`      ▶ ${p}`));
    }
}

testFlow();
