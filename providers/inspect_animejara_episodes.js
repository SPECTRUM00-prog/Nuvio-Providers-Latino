/**
 * Inspección de Episodios y Reproductores en AnimeJara
 * Ejecutar con: node inspect_animejara_episodes.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectEpisodes() {
    console.log(`\n================================================================`);
    console.log(`🎬 [1] INSPECCIONANDO SERIE: https://animejara.com/anime/kimetsu-no-yaiba`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(`${BASE_URL}/anime/kimetsu-no-yaiba`, { headers: { "User-Agent": USER_AGENT } });
        const html = await res.text();
        console.log(`Tamaño HTML Serie: ${html.length} caracteres`);

        // 1. Buscar enlaces a episodios
        const matches = html.match(/href=["'](\/[^"']*(?:episodio|capitulo|ver)[^"']*)["']/gi) || [];
        console.log(`Enlaces con 'ver/episodio' encontrados:`, [...new Set(matches)].slice(0, 10));

        // 2. Buscar elementos con data-numero, data-episode, data-id, onclick
        const epData = html.match(/(?:data-episode|data-num|data-cap|data-href|data-url)=["']([^"']+)["']/gi) || [];
        console.log(`Data attributes de episodios:`, epData.slice(0, 10));

        // 3. Buscar scripts con arrays de episodios
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        scripts.forEach((s, idx) => {
            if (s.includes("episodios") || s.includes("episodes") || s.includes("caps") || s.includes("servers") || s.includes("players")) {
                console.log(`\n--- Script con datos #${idx + 1} ---`);
                console.log(s.substring(0, 500));
            }
        });

    } catch (e) {
        console.error("Error Serie:", e.message);
    }

    console.log(`\n================================================================`);
    console.log(`🎬 [2] INSPECCIONANDO PELÍCULA: https://animejara.com/movie/kimetsu-no-yaiba-mugen-train`);
    console.log(`================================================================\n`);

    try {
        const mRes = await fetch(`${BASE_URL}/movie/kimetsu-no-yaiba-mugen-train`, { headers: { "User-Agent": USER_AGENT } });
        const mHtml = await mRes.text();
        console.log(`Tamaño HTML Película: ${mHtml.length} caracteres`);

        // Buscar iframes o reproductores en la película
        const iframes = mHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
        console.log(`Iframes en Película:`, iframes);

        const dataPlayers = mHtml.match(/(?:data-player|data-src|data-video|data-embed|data-url)=["']([^"']+)["']/gi) || [];
        console.log(`Data Players en Película:`, dataPlayers);

        // Buscar scripts de reproductor
        const mScripts = mHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
        mScripts.forEach((s, idx) => {
            if (s.includes("player") || s.includes("video") || s.includes("sources") || s.includes("iframe") || s.includes("embed")) {
                console.log(`\n--- Script Película #${idx + 1} ---`);
                console.log(s.substring(0, 500));
            }
        });

    } catch (e) {
        console.error("Error Película:", e.message);
    }
}

inspectEpisodes();
