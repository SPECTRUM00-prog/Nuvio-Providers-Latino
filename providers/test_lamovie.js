const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FAST_API = "https://lamovie.org/wp-api/v1";

async function inspectSeriesMap() {
    const seriesUrl = "https://lamovie.org/series/the-last-of-us-2023/";
    console.log(`Leyendo página de la serie: ${seriesUrl}`);

    try {
        const res = await fetch(seriesUrl, {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await res.text();

        // 1. Extraer siteConfig o variables con los capítulos
        const configMatch = html.match(/window\.siteConfig\s*=\s*({[\s\S]*?});/i) ||
                            html.match(/siteConfig\s*=\s*({[\s\S]*?});/i);

        if (configMatch) {
            console.log("\n✅ ¡window.siteConfig encontrado!");
            try {
                // Evaluamos o parseamos el objeto
                const cleanConfig = configMatch[1].replace(/;\s*$/, '');
                console.log("Contenido de siteConfig (primeros 500 caracteres):");
                console.log(cleanConfig.substring(0, 500));
            } catch (e) {
                console.log("Error parseando siteConfig:", e.message);
            }
        }

        // 2. Buscar si hay lista de capítulos en el HTML
        const episodeListMatches = html.match(/["'](\d{4,6})["']\s*:\s*["']([^"']+)["']/g) || [];
        console.log(`\n[2] Posible lista de IDs de capítulos (${episodeListMatches.length} encontrados):`);
        episodeListMatches.slice(0, 10).forEach(m => console.log(`  ${m}`));

        // 3. Probar obtener los reproductores del Post ID 6860 que descubriste
        console.log("\n[3] Probando reproductor para Post ID: 6860...");
        const pRes = await fetch(`${FAST_API}/player?postId=6860&demo=0`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const pData = await pRes.json();
        console.log(`Embeds obtenidos: ${pData?.data?.embeds?.length}`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectSeriesMap();
