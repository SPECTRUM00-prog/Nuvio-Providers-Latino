const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FAST_API = "https://lamovie.org/wp-api/v1";

async function probeEpisodeSequence() {
    console.log("=== PROBANDO SECUENCIA DE IDs DE EPISODIOS ===");
    const seriesId = 6844;

    // Probar del 6844 al 6865 para ver cuáles son episodios reales
    for (let id = 6844; id <= 6865; id++) {
        try {
            const res = await fetch(`${FAST_API}/player?postId=${id}&demo=0`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();
            
            if (json && json.data && json.data.embeds && json.data.embeds.length > 0) {
                const firstUrl = json.data.embeds[0].url || "";
                if (!firstUrl.includes("embed.html")) {
                    console.log(`✅ Post ID [${id}] -> ¡ES UN CAPÍTULO! (${json.data.embeds.length} servidores: ${json.data.embeds[0].server || 'OK'})`);
                } else {
                    console.log(`ℹ️ Post ID [${id}] -> Tráiler / Ficha general de serie`);
                }
            } else if (json && json.message === "Invalid post type") {
                console.log(`❌ Post ID [${id}] -> Invalid post type`);
            }
        } catch (e) {
            console.log(`Error en ID ${id}:`, e.message);
        }
    }
}

probeEpisodeSequence();
