const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function getWpTypes() {
    console.log("=== CONSULTANDO TIPOS DE CONTENIDO EN WORDPRESS ===");

    try {
        const res = await fetch("https://lamovie.org/wp-json/wp/v2/types", {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        
        console.log("\n✅ Tipos de post registrados en LaMovie:");
        for (const [key, val] of Object.entries(json)) {
            console.log(`▶ Tipo: "${key}" -> REST Base: "${val.rest_base}" (${val.rest_namespace || 'wp/v2'})`);
        }

        // Si existe un endpoint para episodios o tvshows, lo probamos con The Last of Us (ID: 6844)
        if (json.episodes || json.episodios || json.tvshows) {
            const epBase = json.episodes?.rest_base || "episodes";
            const testUrl = `https://lamovie.org/wp-json/wp/v2/${epBase}?parent=6844&per_page=20`;
            console.log(`\nProbando consulta: ${testUrl}`);
            const epRes = await fetch(testUrl, { headers: { "User-Agent": USER_AGENT } });
            const epData = await epRes.json();
            console.log(`Capítulos devueltos: ${epData.length || 0}`);
            if (epData.length > 0) {
                console.log("Primer capítulo:", epData[0].id, epData[0].title?.rendered || epData[0].slug);
            }
        }

    } catch (e) {
        console.log("Error:", e.message);
    }
}

getWpTypes();
