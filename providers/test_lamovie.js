const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const EPISODES_API = "https://lamovie.org/wp-json/wpf/v1/episodes";
const PLAYER_API = "https://lamovie.org/wp-api/v1/player";

async function testEpisodes() {
    const seriesId = 6844; // The Last of Us
    console.log(`=== PROBANDO /wpf/v1/episodes PARA SERIE ID: ${seriesId} ===`);

    const variations = [
        `${EPISODES_API}?id=${seriesId}`,
        `${EPISODES_API}?postId=${seriesId}`,
        `${EPISODES_API}?serie_id=${seriesId}`,
        `${EPISODES_API}?id=${seriesId}&season=1`
    ];

    for (const url of variations) {
        try {
            console.log(`\nConsultando: ${url}`);
            const res = await fetch(url, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();

            if (json && (Array.isArray(json) || json.data || json.episodes)) {
                console.log("✅ ¡Episodios obtenidos con éxito!");
                const list = Array.isArray(json) ? json : (json.data || json.episodes);
                console.log(`Total de elementos devueltos: ${list.length}`);
                
                // Mostrar el primer episodio encontrado
                const firstEp = list[0];
                console.log("\nPrimer episodio:");
                console.log(JSON.stringify(firstEp, null, 2));

                const epId = firstEp._id || firstEp.id || firstEp.ID;
                if (epId) {
                    console.log(`\nConsultando reproductor para el Episodio ID: ${epId}...`);
                    const pRes = await fetch(`${PLAYER_API}?postId=${epId}&demo=0`, {
                        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
                    });
                    const pJson = await pRes.json();
                    console.log("Embeds del reproductor:", JSON.stringify(pJson?.data?.embeds || pJson, null, 2));
                }
                break;
            } else {
                console.log("Respuesta:", JSON.stringify(json).substring(0, 150));
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}

testEpisodes();
