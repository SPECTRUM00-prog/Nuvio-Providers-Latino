const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FAST_API = "https://lamovie.org/wp-api/v1";

async function inspectEpisodePage() {
    const episodeUrl = "https://lamovie.org/episodio/the-last-of-us-temporada-1-episodio-1/";
    console.log(`Inspeccionando capítulo: ${episodeUrl}`);

    try {
        const res = await fetch(episodeUrl, {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Buscar el Post ID del capítulo en el HTML
        const idMatches = html.match(/(?:post_id|postId|data-id|id)["':=\s]+(\d+)/gi) || [];
        console.log("\n[1] IDs encontrados en el HTML:", idMatches.slice(0, 8));

        // 2. Buscar si hay scripts de estado o embeds directos
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        scripts.forEach((s, idx) => {
            if (s.includes("embed") || s.includes("vimeos") || s.includes("player") || s.includes("postId")) {
                console.log(`\n--- Script relevante #${idx + 1} ---`);
                console.log(s.substring(0, 400));
            }
        });

        // 3. Probar si el ID del episodio se puede consultar en /wp-api/v1/player
        // Extraemos cualquier número que parezca ID de post
        const numericIds = (html.match(/["'](\d{4,6})["']/g) || []).map(id => id.replace(/["']/g, ''));
        const uniqueIds = [...new Set(numericIds)];

        for (const id of uniqueIds.slice(0, 3)) {
            const pUrl = `${FAST_API}/player?postId=${id}&demo=0`;
            const pRes = await fetch(pUrl, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
            const pJson = await pRes.json();
            if (pJson?.data?.embeds?.length && !pJson.data.embeds[0].url.includes("embed.html")) {
                console.log(`\n✅ ¡Embeds encontrados con éxito para el Post ID: ${id}!`);
                console.log(JSON.stringify(pJson.data.embeds, null, 2));
                break;
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectEpisodePage();
