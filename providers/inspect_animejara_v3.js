/**
 * Inspección de la API AJAX de búsqueda y cards en AnimeJara
 * Ejecutar con: node inspect_animejara_v3.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectV3() {
    console.log(`\n================================================================`);
    console.log(`🔍 [1] EXTRACCIÓN DEL SCRIPT DE BÚSQUEDA (SCRIPT #12)`);
    console.log(`================================================================\n`);

    try {
        const homeRes = await fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT } });
        const homeHtml = await homeRes.text();
        const scripts = homeHtml.match(/<script[\s\S]*?<\/script>/gi) || [];

        scripts.forEach((s, idx) => {
            if (s.includes("HISTORY_KEY") || s.includes("CATALOGO_URL") || s.includes("animejara_search")) {
                console.log(`--- Contenido de Script #${idx + 1} ---`);
                console.log(s);
                console.log("-----------------------------------------");
            }
        });

    } catch (e) {
        console.error("Error Home:", e.message);
    }

    console.log(`\n================================================================`);
    console.log(`🔍 [2] INSPECCIÓN DE TARJETAS EN /emision (DATA ATTRS / ONCLICK)`);
    console.log(`================================================================\n`);

    try {
        const emisionRes = await fetch(`${BASE_URL}/emision`, { headers: { "User-Agent": USER_AGENT } });
        const emisionHtml = await emisionRes.text();

        // 1. Buscar elementos con onclick
        const onClicks = emisionHtml.match(/onclick=["']([^"']+)["']/gi) || [];
        console.log(`Elementos con onclick encontrados:`, onClicks.slice(0, 5));

        // 2. Buscar elementos con data-slug, data-id, data-url
        const dataSlugs = emisionHtml.match(/data-(?:slug|id|url|href|anime|title)=["']([^"']+)["']/gi) || [];
        console.log(`Data attributes encontrados:`, dataSlugs.slice(0, 10));

        // 3. Extraer fragmento de una tarjeta del calendario
        const cardMatch = emisionHtml.match(/<div[^>]+class=["'][^"']*(?:anime|card|item|emision)[^"']*["'][\s\S]*?<\/div>/gi) || [];
        if (cardMatch.length > 0) {
            console.log(`\n--- Fragmento de una tarjeta del calendario ---`);
            console.log(cardMatch[0].substring(0, 400));
        }

    } catch (e) {
        console.error("Error Emisión:", e.message);
    }
}

inspectV3();
