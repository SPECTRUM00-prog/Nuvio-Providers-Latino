// get_links.js - Buscador de enlaces reales para pruebas
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE_URL = "https://embed69.org";

async function getRealLinks(imdbId) {
    console.log(`Buscando iframes para IMDb: ${imdbId} en Embed69...`);
    // targetUrl para película en embed69
    const targetUrl = `${BASE_URL}/f/${imdbId}`;
    
    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://sololatino.net/"
            }
        });
        const html = await res.text();
        
        // Regex para capturar cualquier iframe de servidores de video conocidos
        const regex = /https?:\/\/[^"'\s<>]+(?:minochinos|vidhide|vidhidepro|streamwish|hlswish|hglink|hanerix|voe|johnbeyondnation)[^"'\s<>]*/gi;
        const links = [...new Set(html.match(regex))]; // Eliminar duplicados
        
        if (links.length > 0) {
            console.log("\n✅ ¡Enlaces reales y frescos encontrados!");
            links.forEach((link, i) => {
                let server = "Desconocido";
                if (link.includes("minochinos") || link.includes("vidhide")) server = "VidHide";
                if (link.includes("voe") || link.includes("johnbeyondnation")) server = "VOE";
                if (link.includes("streamwish") || link.includes("hglink")) server = "StreamWish";
                
                console.log(`[${i + 1}] [${server}] -> ${link}`);
            });
        } else {
            console.log("❌ No se encontraron enlaces. ¿Posible bloqueo de Embed69?");
        }
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}

// Probando con el IMDb ID de una película popular reciente (Ej: Deadpool & Wolverine = tt6263850)
// Puedes cambiar este ID por cualquier otro que sepas que está en SoloLatino.
getRealLinks("tt6263850");
