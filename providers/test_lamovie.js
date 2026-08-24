const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function analyzePlayerLogic() {
    console.log("=== ANALIZANDO LÓGICA DEL REPRODUCTOR EN APP.JS ===");

    try {
        const appRes = await fetch("https://lamovie.org/app.js", {
            headers: { "User-Agent": USER_AGENT }
        });
        const appJs = await appRes.text();

        // 1. Buscar cómo llama a /wp-api/v1/player o a los servidores
        console.log("\n[1] Referencias a /player en app.js:");
        const playerMatches = appJs.match(/.{0,80}\/player.{0,80}/gi) || [];
        playerMatches.forEach((m, idx) => console.log(`  [${idx + 1}] ...${m}...`));

        // 2. Buscar cómo construye las URLs de episodios
        console.log("\n[2] Referencias a vimeos / embed en app.js:");
        const embedMatches = appJs.match(/.{0,80}(?:vimeos|embeds|fastApi).{0,80}/gi) || [];
        embedMatches.slice(0, 5).forEach((m, idx) => console.log(`  [${idx + 1}] ...${m}...`));

    } catch (e) {
        console.log("Error analizando app.js:", e.message);
    }

    // 3. Probar URLs directas de episodios en la web
    console.log("\n[3] Probando acceso a páginas de episodios:");
    const testSlugs = [
        "https://lamovie.org/episodio/the-last-of-us-1x1/",
        "https://lamovie.org/episodio/the-last-of-us-1x01/",
        "https://lamovie.org/episodio/the-last-of-us-temporada-1-episodio-1/"
    ];

    for (const url of testSlugs) {
        try {
            const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
            console.log(`URL: ${url} -> Status: ${res.status}`);
            if (res.status === 200) {
                const html = await res.text();
                // Buscar si hay iframe de Vimeos o ID del post
                const vimeosMatch = html.match(/https?:\/\/[^"'\s<>]*vimeos[^"'\s<>]*/i);
                const postIdMatch = html.match(/(?:postId|post_id|id)\s*[:=]\s*["']?(\d+)["']?/i);
                if (vimeosMatch) console.log(`  ✅ Vimeos encontrado: ${vimeosMatch[0]}`);
                if (postIdMatch) console.log(`  ✅ Post ID del episodio: ${postIdMatch[1]}`);
            }
        } catch {}
    }
}

analyzePlayerLogic();
