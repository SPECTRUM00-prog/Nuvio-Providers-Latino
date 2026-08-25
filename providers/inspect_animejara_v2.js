/**
 * Inspección de Scripts AJAX y Enlaces Reales de AnimeJara
 * Ejecutar con: node inspect_animejara_v2.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectV2() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] ANALIZANDO SCRIPTS DE BÚSQUEDA Y AJAX EN HOME`);
    console.log(`================================================================\n`);

    try {
        const homeRes = await fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT } });
        const homeHtml = await homeRes.text();
        const scripts = homeHtml.match(/<script[\s\S]*?<\/script>/gi) || [];

        scripts.forEach((s, idx) => {
            if (s.includes("admin-ajax.php") || s.includes("buscar") || s.includes("search") || s.includes("AJAX_URL")) {
                console.log(`\n--- Script AJAX #${idx + 1} Completo ---`);
                console.log(s.substring(0, 1000));
                console.log("-----------------------------------------");
            }
        });

    } catch (e) {
        console.error("Error Home:", e.message);
    }

    console.log(`\n================================================================`);
    console.log(`🔍 [2] EXTRACCIÓN DE ENLACES DESDE /emision`);
    console.log(`================================================================\n`);

    try {
        const emisionRes = await fetch(`${BASE_URL}/emision`, { headers: { "User-Agent": USER_AGENT } });
        const emisionHtml = await emisionRes.text();

        // Buscar todos los enlaces <a href="...">
        const allHrefs = [];
        const hrefRegex = /href=["']([^"']+)["']/gi;
        let match;
        while ((match = hrefRegex.exec(emisionHtml)) !== null) {
            const h = match[1];
            if (!h.includes("/wp-") && !h.includes("/feed") && !h.startsWith("#") && h !== "/" && h !== "/emision" && h !== "/catalogo" && h !== "/login") {
                if (!allHrefs.includes(h)) allHrefs.push(h);
            }
        }

        console.log(`Enlaces encontrados en /emision:`, allHrefs.slice(0, 10));

        // Si encontramos un enlace de anime, lo inspeccionamos
        if (allHrefs.length > 0) {
            let sampleUrl = allHrefs[0];
            if (!sampleUrl.startsWith("http")) sampleUrl = BASE_URL + (sampleUrl.startsWith("/") ? sampleUrl : "/" + sampleUrl);
            
            console.log(`\n================================================================`);
            console.log(`🎬 [3] INSPECCIONANDO ANIME / EPISODIO: ${sampleUrl}`);
            console.log(`================================================================\n`);

            const sRes = await fetch(sampleUrl, { headers: { "User-Agent": USER_AGENT } });
            const sHtml = await sRes.text();
            console.log(`Tamaño HTML: ${sHtml.length} chars`);

            // Buscar iframes, players y servidores
            const iframes = sHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
            console.log(`Iframes encontrados (${iframes.length}):`, iframes);

            const dataAttrs = sHtml.match(/(?:data-player|data-src|data-video|data-embed|data-url)=["']([^"']+)["']/gi) || [];
            console.log(`Data attributes encontrados (${dataAttrs.length}):`, dataAttrs.slice(0, 5));

            const playerScripts = sHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
            playerScripts.forEach((ps, i) => {
                if (ps.includes("player") || ps.includes("servers") || ps.includes("video") || ps.includes("iframe") || ps.includes("embed")) {
                    console.log(`\n--- Script Reproductor #${i + 1} ---`);
                    console.log(ps.substring(0, 500));
                }
            });
        }

    } catch (e) {
        console.error("Error Emisión:", e.message);
    }
}

inspectV2();
