const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FAST_API = "https://lamovie.org/wp-api/v1";

async function testEpisodeList() {
    const seriesId = 6844; // The Last of Us
    const season = 1;

    console.log(`=== CONSULTANDO LISTA DE EPISODIOS ===`);
    const url = `${FAST_API}/single/episodes/list?_id=${seriesId}&season=${season}&page=1&postsPerPage=50`;
    console.log(`URL: ${url}`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        });
        const json = await res.json();
        console.log("\n✅ ¡Respuesta de la API recibida!");
        console.log("Claves:", Object.keys(json?.data || json));

        const posts = json?.data?.posts || json?.posts || [];
        console.log(`Total de episodios encontrados: ${posts.length}`);

        posts.forEach(ep => {
            console.log(`▶ [Episodio ${ep.episode || ep.number || ep.episode_number}] "${ep.title}" -> Post ID: ${ep._id || ep.id}`);
        });

        // Probar obtener el reproductor del primer episodio de la lista
        if (posts.length > 0) {
            const firstEpId = posts[0]._id || posts[0].id;
            console.log(`\nConsultando reproductor para el Episodio 1 (ID: ${firstEpId})...`);
            const pRes = await fetch(`${FAST_API}/player?postId=${firstEpId}&demo=0`, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const pJson = await pRes.json();
            console.log(`Servidores listos: ${pJson?.data?.embeds?.length}`);
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

testEpisodeList();
