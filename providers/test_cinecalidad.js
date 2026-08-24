const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectVideoAppScripts() {
    const url = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== ANALIZANDO SCRIPTS EN: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            },
            redirect: "follow"
        });

        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Extraer todas las etiquetas <script>
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log(`\nEtiquetas <script> encontradas: ${scripts.length}\n`);

        scripts.forEach((s, idx) => {
            console.log(`--- Script #${idx + 1} ---`);
            // Limitar longitud para evitar saturar la consola si es muy largo
            console.log(s.length > 500 ? s.substring(0, 500) + "\n...[truncado]" : s);
            console.log("-------------------------\n");
        });

        // 2. Buscar coincidencias de URLs de video (.m3u8, .mp4) o JSON de fuentes
        const mediaMatches = html.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/gi) || [];
        if (mediaMatches.length > 0) {
            console.log("Enlaces multimedia directos encontrados:");
            mediaMatches.forEach(m => console.log(` ▶ ${m}`));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectVideoAppScripts();
