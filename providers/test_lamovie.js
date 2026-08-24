const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const WPF_URL = "https://lamovie.org/wp-json/wpf/v1";
const FAST_URL = "https://lamovie.org/wp-api/v1";

async function testWPF() {
    console.log("=== PROBANDO ENDPOINTS DE LA API WPF ===");
    const seriesId = 6844;
    const slug = "the-last-of-us-2023";

    const endpoints = [
        `${WPF_URL}/post?id=${seriesId}`,
        `${WPF_URL}/post?slug=${slug}`,
        `${WPF_URL}/serie?id=${seriesId}`,
        `${WPF_URL}/seasons?postId=${seriesId}`,
        `${FAST_URL}/post?slug=${slug}`
    ];

    for (const url of endpoints) {
        try {
            console.log(`\nConsultando: ${url}`);
            const res = await fetch(url, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();
            
            if (json && (json.data || json.seasons || json.episodes || json.id)) {
                console.log("✅ ¡Respuesta encontrada!");
                console.log("Claves:", Object.keys(json.data || json));
                
                const str = JSON.stringify(json);
                console.log("Muestra de datos:", str.substring(0, 400) + "...");
                
                // Si encontramos temporadas/episodios, mostrar el primero
                const data = json.data || json;
                if (data.seasons || data.temporadas) {
                    console.log("\n-> Temporadas encontradas:");
                    console.log(JSON.stringify(data.seasons || data.temporadas, null, 2).substring(0, 500));
                }
            } else {
                console.log("❌ Sin datos útiles.");
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}

testWPF();
