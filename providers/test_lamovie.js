const SITE_URL = "https://lamovie.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectSeries() {
    const seriesId = 6844; // The Last of Us
    console.log(`Inspeccionando API de LaMovie para ID: ${seriesId}...`);

    // 1. Probar endpoint /wp-api/v1/post
    try {
        const res = await fetch(`${SITE_URL}/wp-api/v1/post?id=${seriesId}`, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        console.log("\n[1] Claves devueltas en /wp-api/v1/post:", Object.keys(json?.data || {}));
        
        // Si hay temporadas, mostrar su estructura
        if (json?.data) {
            console.log("Datos de la serie:", JSON.stringify(json.data).substring(0, 500) + "...");
        }
    } catch (e) {
        console.log("Error en /wp-api/v1/post:", e.message);
    }

    // 2. Probar si existen otros endpoints como /seasons o /episodes
    const endpoints = [
        `/wp-api/v1/seasons?id=${seriesId}`,
        `/wp-api/v1/episodes?id=${seriesId}`,
        `/wp-api/v1/player?postId=${seriesId}&type=tvshows`
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(`${SITE_URL}${ep}`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();
            if (json?.data) {
                console.log(`\n[2] Respuesta válida en endpoint: ${ep}`);
                console.log(JSON.stringify(json.data).substring(0, 300));
            }
        } catch {}
    }
}

inspectSeries();
