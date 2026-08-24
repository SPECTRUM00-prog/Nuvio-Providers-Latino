const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectMainJs() {
    const mainJsUrl = "https://hglink.to/main.js?v=1.1.9";
    console.log(`=== DESCARGANDO: ${mainJsUrl} ===`);

    try {
        const res = await fetch(mainJsUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://hglink.to/"
            }
        });

        const code = await res.text();
        console.log(`Tamaño del JS: ${code.length} caracteres`);
        console.log("\n--- CÓDIGO JS DE HGLINK ---");
        console.log(code);
        console.log("---------------------------\n");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectMainJs();
