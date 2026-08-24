const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectEpisodesArgs() {
    console.log("=== INSPECCIONANDO PARÁMETROS EXACTOS ===");

    // 1. Ver qué argumentos pide /wpf/v1/episodes en la API
    try {
        const res = await fetch("https://lamovie.org/wp-json/wpf/v1", {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
        });
        const json = await res.json();
        const routeData = json?.routes?.["/wpf/v1/episodes"] || json?.routes?.["/wpf/v1/episodes/"];
        
        if (routeData) {
            console.log("\n✅ Argumentos que espera /wpf/v1/episodes:");
            console.log(JSON.stringify(routeData.endpoints?.[0]?.args || routeData, null, 2));
        }
    } catch (e) {
        console.log("Error inspeccionando schema:", e.message);
    }

    // 2. Buscar en el app.js de LaMovie la llamada a /episodes
    try {
        console.log("\nBuscando llamada en app.js...");
        const appRes = await fetch("https://lamovie.org/app.js", {
            headers: { "User-Agent": USER_AGENT }
        });
        const appJs = await appRes.text();
        
        // Buscar apariciones de "episodes" en el código
        const matches = appJs.match(/.{0,60}episodes.{0,60}/gi) || [];
        console.log(`Encontradas ${matches.length} referencias a 'episodes' en app.js:`);
        matches.slice(0, 5).forEach((m, idx) => console.log(` [${idx + 1}] ...${m}...`));

    } catch (e) {
        console.log("Error leyendo app.js:", e.message);
    }
}

inspectEpisodesArgs();
