/**
 * Inspección profunda de Catálogo, Episodios y Servidores de AnimeJara
 * Ejecutar con: node inspect_animejara_details.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectDetails() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] ANALIZANDO BÚSQUEDA EN CATÁLOGO (HTML)`);
    console.log(`================================================================\n`);

    const query = "grand blue";
    const catUrl = `${BASE_URL}/catalogo?buscar=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(catUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL }
        });
        const html = await res.text();
        console.log(`Status Catálogo: ${res.status}`);

        // Extraer tarjetas de animes
        const animeCards = [];
        const linkRegex = /href=["'](https?:\/\/animejara\.com\/[^"']+)["'][^>]*>/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            const link = match[1];
            if (!link.includes("/catalogo") && !link.includes("/emision") && !link.includes("/wp-") && !link.includes("/feed") && !link.includes("/#")) {
                if (!animeCards.includes(link)) animeCards.push(link);
            }
        }

        console.log(`Animes encontrados para "${query}":`, animeCards.slice(0, 5));

        // 2. Si encontramos un anime, inspeccionemos su página principal y sus capítulos
        if (animeCards.length > 0) {
            const targetAnime = animeCards[0];
            console.log(`\n================================================================`);
            console.log(`🎬 [2] INSPECCIONANDO PÁGINA DEL ANIME: ${targetAnime}`);
            console.log(`================================================================\n`);

            const aRes = await fetch(targetAnime, { headers: { "User-Agent": USER_AGENT } });
            const aHtml = await aRes.text();
            console.log(`Tamaño HTML Anime: ${aHtml.length} chars`);

            // Extraer enlaces a episodios
            const epLinks = [];
            const epRegex = /href=["'](https?:\/\/animejara\.com\/ver\/[^"']+)["']/gi;
            let epMatch;
            while ((epMatch = epRegex.exec(aHtml)) !== null) {
                if (!epLinks.includes(epMatch[1])) epLinks.push(epMatch[1]);
            }

            console.log(`Episodios encontrados en el anime:`, epLinks.slice(0, 5));

            // 3. Inspeccionar el primer episodio para ver los reproductores
            if (epLinks.length > 0) {
                const targetEp = epLinks[0];
                console.log(`\n================================================================`);
                console.log(`📺 [3] INSPECCIONANDO EPISODIO: ${targetEp}`);
                console.log(`================================================================\n`);

                const epRes = await fetch(targetEp, { headers: { "User-Agent": USER_AGENT, "Referer": targetAnime } });
                const epHtml = await epRes.text();
                console.log(`Tamaño HTML Episodio: ${epHtml.length} chars`);

                // Buscar iframes, data-player, data-src, variables de video
                console.log("\n[Reproductores y fuentes detectadas]");
                const iframes = epHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
                iframes.forEach(ifr => console.log("  Iframe:", ifr));

                const dataPlayers = epHtml.match(/(?:data-player|data-src|data-video|data-embed)=["']([^"']+)["']/gi) || [];
                dataPlayers.forEach(dp => console.log("  Data-Attr:", dp));

                const scripts = epHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
                scripts.forEach((s, idx) => {
                    if (s.includes("player") || s.includes("video") || s.includes("server") || s.includes("embed") || s.includes("sources")) {
                        console.log(`\n--- Script relevante #${idx + 1} ---`);
                        console.log(s.substring(0, 350));
                    }
                });
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectDetails();
