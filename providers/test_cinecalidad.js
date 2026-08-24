const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function extractInnerFrame() {
    const url = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== EXTRAYENDO IFRAME REAL DE VIDEOAPP: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            }
        });
        const html = await res.text();

        // 1. Buscar cualquier etiqueta <iframe>
        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
                            html.match(/src=["'](https?:\/\/[^"']+)["']/i);

        if (iframeMatch) {
            console.log("\n🎉 ¡REPRODUCTOR REAL ENCONTRADO DENTRO DEL IFRAME!");
            console.log("URL interna:", iframeMatch[1]);
        } else {
            console.log("\nBuscando todas las etiquetas iframe en el HTML:");
            const allIframes = html.match(/<iframe[\s\S]*?>/gi) || [];
            allIframes.forEach(f => console.log(f));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

extractInnerFrame();
