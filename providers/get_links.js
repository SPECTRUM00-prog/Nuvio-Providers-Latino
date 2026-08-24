// Inspección profunda de Embed69
const BASE_URL = "https://embed69.org";

async function dumpEmbed69Script(imdbId) {
    const targetUrl = `${BASE_URL}/f/${imdbId}`;
    console.log(`Analizando: ${targetUrl}`);

    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": `${BASE_URL}/`
            }
        });

        const html = await res.text();

        // 1. Buscar botones o pestañas de servidores en el HTML
        console.log("\n[1] Buscando botones de servidores / data-url / data-src:");
        const buttons = html.match(/<(?:button|li|div|a)[^>]+(?:data-src|data-url|data-server|data-id|server)[^>]*>/gi) || [];
        if (buttons.length > 0) {
            buttons.slice(0, 10).forEach(b => console.log(b));
        } else {
            console.log("No se encontraron botones con data-src directo.");
        }

        // 2. Extraer completo el Script con el POW_CHALLENGE
        console.log("\n[2] Contenido completo del Script de Embed69:");
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        const powScript = scripts.find(s => s.includes("POW_CHALLENGE"));

        if (powScript) {
            console.log("-----------------------------------------");
            console.log(powScript);
            console.log("-----------------------------------------");
        } else {
            console.log("No se encontró el script POW.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

// Analizar con Deadpool & Wolverine
dumpEmbed69Script("tt6263850");
