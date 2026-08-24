const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FAST_API = "https://lamovie.org/wp-api/v1";

async function testSeriesEndpoints() {
    const seriesId = 6844; // The Last of Us
    console.log(`=== PROBANDO ENDPOINTS PARA SERIE ID: ${seriesId} ===`);

    const endpoints = [
        `${FAST_API}/episodes/tvshows/${seriesId}`,
        `${FAST_API}/seasons/tvshows/${seriesId}`,
        `${FAST_API}/tvshows/${seriesId}`,
        `${FAST_API}/seasons/${seriesId}`,
        `${FAST_API}/episodes/${seriesId}`,
        `${FAST_API}/season/${seriesId}/1`,
        `${FAST_API}/episodes/${seriesId}/1`
    ];

    for (const url of endpoints) {
        try {
            console.log(`\nConsultando: ${url}`);
            const res = await fetch(url, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();

            if (json && (Array.isArray(json) || json.data || json.seasons || json.episodes)) {
                console.log("✅ ¡RESPUESTA VÁLIDA ENCONTRADA!");
                const data = Array.isArray(json) ? json : (json.data || json);
                console.log("Contenido devuelto:");
                console.log(JSON.stringify(data, null, 2).substring(0, 500));
                break;
            } else {
                console.log("Respuesta:", JSON.stringify(json).substring(0, 100));
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}

testSeriesEndpoints();
