/**
 * Inspección de Episodios y Reproductores de Video en AnimeJara
 * Ejecutar con: node inspect_animejara_player.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;

async function inspectPlayer() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] PROBANDO LIVE_SEARCH API CON "Kimetsu no Yaiba" y "Nana"`);
    console.log(`================================================================\n`);

    const query = "Kimetsu no Yaiba";

    try {
        const res = await fetch(AJAX_URL, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": `${BASE_URL}/`
            },
            body: new URLSearchParams({ action: "live_search", s: query }).toString()
        });

        console.log(`HTTP Status: ${res.status} ${res.statusText}`);
        const json = await res.json();
        console.log("Respuesta JSON:", JSON.stringify(json, null, 2));

        const animes = json?.data?.animes || [];
        if (animes.length === 0) {
            console.log("No se encontraron animes.");
            return;
        }

        // 2. Tomar el primer anime e inspeccionar su página
        const anime = animes[0];
        const isMovie = (anime.tipo && (anime.tipo.toLowerCase() === "movie" || anime.tipo.toLowerCase() === "pelicula"));
        const animeUrl = `${BASE_URL}${isMovie ? "/movie/" : "/anime/"}${anime.slug}`;
        
        console.log(`\n================================================================`);
        console.log(`🎬 [2] CONSULTANDO PÁGINA DEL ANIME: ${animeUrl}`);
        console.log(`================================================================\n`);

        const aRes = await fetch(animeUrl, { headers: { "User-Agent": USER_AGENT } });
        const aHtml = await aRes.text();
        console.log(`Tamaño HTML: ${aHtml.length} caracteres`);

        // Extraer enlaces a episodios
        const epRegex = /href=["'](https?:\/\/animejara\.com\/ver\/[^"']+)["']/gi;
        const epLinks = [];
        let epMatch;
        while ((epMatch = epRegex.exec(aHtml)) !== null) {
            if (!epLinks.includes(epMatch[1])) epLinks.push(epMatch[1]);
        }

        // Buscar también rutas relativas
        const relRegex = /href=["'](\/ver\/[^"']+)["']/gi;
        while ((epMatch = relRegex.exec(aHtml)) !== null) {
            const full = BASE_URL + epMatch[1];
            if (!epLinks.includes(full)) epLinks.push(full);
        }

        console.log(`Episodios encontrados en la serie (${epLinks.length}):`, epLinks.slice(0, 5));

        // 3. Inspeccionar el Episodio 1
        const targetEpUrl = epLinks.length > 0 ? epLinks[0] : `${BASE_URL}/ver/${anime.slug}-episodio-1`;
        console.log(`\n================================================================`);
        console.log(`📺 [3] INSPECCIONANDO EPISODIO 1: ${targetEpUrl}`);
        console.log(`================================================================\n`);

        const epRes = await fetch(targetEpUrl, { headers: { "User-Agent": USER_AGENT, "Referer": animeUrl } });
        console.log(`Status Episodio: ${epRes.status}`);
        const epHtml = await epRes.text();

        // Buscar iframes, data-player, data-src, variables de video
        console.log("\n[Reproductores y fuentes detectadas]");
        const iframes = epHtml.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
        iframes.forEach(ifr => console.log("  Iframe:", ifr));

        const dataPlayers = epHtml.match(/(?:data-player|data-src|data-video|data-embed|data-url|data-server)=["']([^"']+)["']/gi) || [];
        dataPlayers.forEach(dp => console.log("  Data-Attr:", dp));

        const scripts = epHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
        scripts.forEach((s, idx) => {
            if (s.includes("player") || s.includes("video") || s.includes("server") || s.includes("embed") || s.includes("SUB") || s.includes("LAT") || s.includes("CAS") || s.includes("sources")) {
                console.log(`\n--- Script Reproductor #${idx + 1} ---`);
                console.log(s.substring(0, 400));
            }
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectPlayer();
