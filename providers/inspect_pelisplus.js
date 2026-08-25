/**
 * Herramienta de Inspección para PelisPlus / TioPlus
 * Ejecutar con: node inspect_pelisplus.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://tioplus.app";

async function inspectPelisplus() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] PROBANDO BUSCADOR DE TIOPLUS`);
    console.log(`================================================================\n`);

    const searchQueries = ["Deadpool", "Deadpool y Wolverine", "Deadpool Wolverine"];

    for (const q of searchQueries) {
        console.log(`--- Buscando: "${q}" ---`);

        // Intento 1: API search
        const apiUrl = `${BASE_URL}/api/search/${encodeURIComponent(q)}`;
        try {
            const res = await fetch(apiUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept": "*/*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": `${BASE_URL}/search`
                }
            });
            console.log(`  [API] Status: ${res.status}`);
            const text = await res.text();
            console.log(`  [API] Respuesta (${text.length} chars): ${text.substring(0, 200)}...`);
        } catch (e) {
            console.log(`  [API] Error: ${e.message}`);
        }

        // Intento 2: HTML search
        const htmlUrl = `${BASE_URL}/search/${encodeURIComponent(q)}`;
        try {
            const res = await fetch(htmlUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
            });
            console.log(`  [HTML] Status: ${res.status}`);
            const text = await res.text();
            console.log(`  [HTML] Respuesta (${text.length} chars): ${text.substring(0, 200)}...`);
            
            // Buscar enlaces a películas
            const matches = text.match(/href=["'](\/pelicula\/[^"']+)["']/gi) || [];
            console.log(`  [HTML] Películas encontradas:`, matches.slice(0, 5));
        } catch (e) {
            console.log(`  [HTML] Error: ${e.message}`);
        }
        console.log("");
    }

    console.log(`\n================================================================`);
    console.log(`🔍 [2] PROBANDO PÁGINA DIRECTA DE DEADPOOL & WOLVERINE`);
    console.log(`================================================================\n`);

    const testPages = [
        `${BASE_URL}/pelicula/deadpool-wolverine`,
        `${BASE_URL}/pelicula/deadpool-3`,
        `${BASE_URL}/pelicula/deadpool-y-wolverine`
    ];

    for (const page of testPages) {
        try {
            const res = await fetch(page, {
                headers: { "User-Agent": USER_AGENT, "Referer": `${BASE_URL}/` }
            });
            console.log(`Página: ${page} -> Status: ${res.status}`);
            if (res.ok) {
                const html = await res.text();
                console.log(`Tamaño HTML: ${html.length} chars`);
                const dataServers = html.match(/data-server=["']([^"']+)["']/gi) || [];
                const dataTr = html.match(/data-tr=["']([^"']+)["']/gi) || [];
                const iframes = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
                console.log(`  data-server encontrados: ${dataServers.length}`);
                console.log(`  data-tr encontrados: ${dataTr.length}`);
                console.log(`  iframes encontrados: ${iframes.length}`);
            }
        } catch (e) {
            console.log(`Error al conectar con ${page}: ${e.message}`);
        }
    }
}

inspectPelisplus();
