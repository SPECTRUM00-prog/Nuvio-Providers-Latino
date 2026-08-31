/**
 * Inspección detallada del algoritmo PoW de Embed69
 * Ejecutar con: node inspect_embed69.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function dumpEmbed69Script() {
    const url = "https://embed69.org/f/tt0386180-1x01";
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://pelispedia.mov/"
            }
        });

        const html = await res.text();
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];

        scripts.forEach((s, idx) => {
            if (s.includes("POW_CHALLENGE") || s.includes("POW_SALT") || s.includes("CryptoJS") || s.includes("AES")) {
                console.log(`\n================ SCRIPT #${idx + 1} COMPLETO ================`);
                console.log(s);
                console.log(`==========================================================\n`);
            }
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

dumpEmbed69Script();
