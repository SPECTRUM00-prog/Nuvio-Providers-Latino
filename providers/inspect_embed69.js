/**
 * Herramienta de Inspección Profunda: Embed69 & PelisPedia
 * Ejecutar con: node inspect_embed69.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectEmbed69() {
    const url = "https://embed69.org/f/tt0386180-1x01";
    console.log(`\n================================================================`);
    console.log(`🔍 INSPECCIONANDO EMBED69: ${url}`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": "https://pelispedia.mov/"
            },
            redirect: "follow"
        });

        console.log(`📡 Status: ${res.status}`);
        const html = await res.text();
        console.log(`📄 Tamaño HTML: ${html.length} bytes\n`);

        // 1. Buscar todos los scripts
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log(`Total de scripts encontrados: ${scripts.length}\n`);

        scripts.forEach((s, idx) => {
            const lower = s.toLowerCase();
            if (
                lower.includes("morencius") ||
                lower.includes("hanerix") ||
                lower.includes("voe") ||
                lower.includes("eval(") ||
                lower.includes("servers") ||
                lower.includes("links") ||
                lower.includes("atob(") ||
                lower.includes("player") ||
                lower.includes("source")
            ) {
                console.log(`---------------- Script #${idx + 1} ----------------`);
                console.log(s.substring(0, 600));
                console.log(`----------------------------------------------------\n`);
            }
        });

        // 2. Buscar enlaces o códigos de servidores directos
        const matches = html.match(/https?:\/\/[^"'\s<>]*(?:morencius|hanerix|hglink|voe|streamwish|vidhide)[^"'\s<>]*/gi) || [];
        if (matches.length > 0) {
            console.log(`[Servidores encontrados directamente en el HTML]:`);
            matches.forEach(m => console.log("  ▶", m));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectEmbed69();
