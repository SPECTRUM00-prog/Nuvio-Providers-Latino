/**
 * Inspección rápida de fuentes para Zilla y Byse
 * Ejecutar con: node inspect_sources.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const urls = [
    { name: "Zilla HLS", url: "https://player.zilla-networks.com/play/4b607e1f2338f99bdffe0d8ceb031c29" },
    { name: "Byse Player", url: "https://byselapuix.com/e/rhg2tnppfn66" }
];

async function dumpSources() {
    for (const item of urls) {
        console.log(`\n================================================================`);
        console.log(`📄 HTML COMPLETO DE: ${item.name} (${item.url})`);
        console.log(`================================================================\n`);

        try {
            const res = await fetch(item.url, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": "https://animeav1.com/",
                    "Origin": "https://animeav1.com"
                }
            });

            const html = await res.text();
            console.log(html);
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

dumpSources();
