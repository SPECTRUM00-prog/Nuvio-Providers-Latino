const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function mapRoutes() {
    console.log("=== DESCUBRIENDO RUTAS DE LA API ===");

    const roots = [
        "https://lamovie.org/wp-json/wpf/v1",
        "https://lamovie.org/wp-api/v1",
        "https://lamovie.org/wp-json/wp/v2"
    ];

    for (const rootUrl of roots) {
        try {
            console.log(`\nConsultando raíz: ${rootUrl}`);
            const res = await fetch(rootUrl, {
                headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
            });
            const json = await res.json();

            if (json && json.routes) {
                console.log(`✅ Rutas encontradas en ${rootUrl}:`);
                const routeKeys = Object.keys(json.routes);
                routeKeys.forEach(r => console.log(`  -> ${r}`));
            } else if (json && json.namespaces) {
                console.log(`Namespaces disponibles:`, json.namespaces);
            } else {
                console.log("Sin mapa de rutas visible.");
            }
        } catch (e) {
            console.log("Error:", e.message);
        }
    }
}

mapRoutes();
