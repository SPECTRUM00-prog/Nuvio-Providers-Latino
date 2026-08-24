// Diagnóstico de Embed69
const BASE_URL = "https://embed69.org";

async function inspectEmbed69(imdbId) {
    const targetUrl = `${BASE_URL}/f/${imdbId}`;
    console.log(`[1] Consultando: ${targetUrl}`);

    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": `${BASE_URL}/`
            }
        });

        console.log(`[2] HTTP Status: ${res.status}`);
        const html = await res.text();
        console.log(`[3] Tamaño HTML: ${html.length} caracteres`);

        if (res.status !== 200 || html.length < 500) {
            console.log("\n⚠️ La página devolvió un error o respuesta corta.");
            console.log(html.substring(0, 300));
            return;
        }

        // Buscar todos los iframes o src
        const iframes = html.match(/<iframe[\s\S]*?>/gi) || [];
        console.log(`\n[4] iFrames encontrados (<iframe ...>): ${iframes.length}`);
        iframes.forEach((f, i) => console.log(`  [${i + 1}] ${f}`));

        // Buscar bloques de script con datos o URLs
        console.log("\n[5] Buscando variables y scripts en el HTML...");
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        scripts.forEach((s, idx) => {
            if (s.includes("server") || s.includes("embed") || s.includes("player") || s.includes("base64") || s.includes("http")) {
                console.log(`\n--- Script relevante #${idx + 1} ---`);
                console.log(s.substring(0, 400) + (s.length > 400 ? "..." : ""));
            }
        });

    } catch (e) {
        console.error("Error al conectar con Embed69:", e.message);
    }
}

// Probando con Deadpool & Wolverine (tt6263850)
inspectEmbed69("tt6263850");
