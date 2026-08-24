const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectHgLink() {
    const url = "https://hglink.to/e/hzf2gnqi94cn";
    console.log(`=== INSPECCIONANDO PÁGINA PUENTE: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://embed69.org/"
            }
        });

        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);
        console.log("\n--- CONTENIDO HTML COMPLETO ---");
        console.log(html);
        console.log("--------------------------------\n");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectHgLink();
