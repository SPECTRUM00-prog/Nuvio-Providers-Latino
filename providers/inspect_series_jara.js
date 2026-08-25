/**
 * Inspección de episodios de series en AnimeJara
 * Ejecutar con: node inspect_series_jara.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectSeries() {
    const urls = [
        "https://animejara.com/anime/grand-blue",
        "https://animejara.com/anime/kimetsu-no-yaiba"
    ];

    for (const url of urls) {
        console.log(`\n================================================================`);
        console.log(`🔍 INSPECCIONANDO SERIE: ${url}`);
        console.log(`================================================================\n`);

        try {
            const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
            const html = await res.text();

            // 1. Buscar todos los idanime que aparecen en los botones o selects de episodios/temporadas
            const allIdAnimes = html.match(/idanime=(\d+)/gi) || [];
            console.log(`Todos los 'idanime' encontrados:`, [...new Set(allIdAnimes)]);

            // 2. Buscar botones de episodios, capítulos, idiomas o temporadas
            const epButtons = html.match(/<(?:button|a|li|div|option)[^>]+(?:data-id|data-num|data-cap|data-ep|data-temp|idanime)[^>]*>[\s\S]*?<\/(?:button|a|li|div|option)>/gi) || [];
            console.log(`Botones/Opciones de episodios detectados (${epButtons.length}):`);
            epButtons.slice(0, 8).forEach(b => console.log("  Elemento:", b.replace(/\s+/g, " ")));

            // 3. Buscar si hay llamadas a AJAX de episodios
            const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
            scripts.forEach((s, idx) => {
                if (s.includes("idanime") || s.includes("load_episodes") || s.includes("cambiar_episodio") || s.includes("temporada") || s.includes("capitulo") || s.includes("multiplayer")) {
                    console.log(`\n--- Script relevante #${idx + 1} ---`);
                    console.log(s.substring(0, 500));
                }
            });

        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

inspectSeries();
