/**
 * Herramienta de Inspección de AnimeJara para Nuvio
 * Ejecutar con: node inspect_animejara.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectAnimeJara() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] ANALIZANDO PÁGINA PRINCIPAL Y ENDPOINTS DE BÚSQUEDA`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(BASE_URL, {
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL }
        });
        console.log(`HTTP Status: ${res.status} ${res.statusText}`);
        const html = await res.text();
        console.log(`Tamaño HTML Home: ${html.length} caracteres`);

        // 1. Detectar scripts y frameworks (Next.js, Nuxt, SvelteKit, API REST, etc.)
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log(`Total de scripts en Home: ${scripts.length}`);
        
        scripts.forEach((s, idx) => {
            if (s.includes("__NEXT_DATA__") || s.includes("api") || s.includes("search") || s.includes("route")) {
                console.log(`  [Script #${idx + 1}]: ${s.substring(0, 180).replace(/\s+/g, " ")}...`);
            }
        });

        // 2. Extraer enlaces de animes para ver la estructura de slugs y URLs
        const animeLinks = html.match(/href=["'](\/(?:anime|ver|catalogo|serie|media)[^"']*)["']/gi) || [];
        const uniqueLinks = [...new Set(animeLinks.map(l => l.replace(/href=["']|["']/g, "")))];
        console.log(`\nEnlaces de animes encontrados en Home:`, uniqueLinks.slice(0, 8));

    } catch (e) {
        console.error("Error conectando a AnimeJara:", e.message);
    }

    // 3. Probar posibles endpoints de búsqueda
    console.log(`\n================================================================`);
    console.log(`🔍 [2] PROBANDO ENDPOINTS DE BÚSQUEDA`);
    console.log(`================================================================\n`);

    const searchTestQueries = ["grand blue", "nana", "kimetsu"];
    const searchEndpoints = [
        "/api/search?q=",
        "/api/anime/search?q=",
        "/search?q=",
        "/catalogo?buscar="
    ];

    for (const ep of searchEndpoints) {
        for (const q of searchTestQueries) {
            const url = `${BASE_URL}${ep}${encodeURIComponent(q)}`;
            try {
                const sRes = await fetch(url, {
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": `${BASE_URL}/`,
                        "Accept": "application/json, text/plain, */*"
                    }
                });
                const cType = sRes.headers.get("content-type") || "";
                console.log(`Petición: [${sRes.status}] ${url} (Content-Type: ${cType})`);
                if (sRes.ok && cType.includes("json")) {
                    const json = await sRes.json();
                    console.log(`  🎯 ¡API JSON ENCONTRADA!:`, JSON.stringify(json).substring(0, 200));
                    break;
                }
            } catch (err) {}
        }
    }
}

inspectAnimeJara();
