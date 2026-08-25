/**
 * Extracción del Script de Renderizado de Episodios
 * Ejecutar con: node inspect_episode_script.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animejara.com";

async function inspectEpisodeScript() {
    console.log(`\n================================================================`);
    console.log(`🔍 EXTRAYENDO SCRIPT DE EPISODIOS EN: https://animejara.com/anime/kimetsu-no-yaiba`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(`${BASE_URL}/anime/kimetsu-no-yaiba`, { headers: { "User-Agent": USER_AGENT } });
        const html = await res.text();
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];

        scripts.forEach((s, idx) => {
            if (s.includes("episodio-row") || s.includes("numEp") || s.includes("displayNum") || s.includes("temporadas") || s.includes("episodes")) {
                console.log(`\n--- SCRIPT DE EPISODIOS ENCONTRADO (#${idx + 1}) ---`);
                console.log(s);
                console.log("----------------------------------------------------\n");
            }
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectEpisodeScript();
