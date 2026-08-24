const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function dumpVideoAppScript() {
    const url = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== EXRAYENDO SCRIPT COMPLETO DE: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            }
        });

        const html = await res.text();

        // Extraer todo el contenido del bloque <script>
        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
            console.log("\n--- CÓDIGO JS DE VIDEOAPP ---");
            console.log(scriptMatch[1]);
            console.log("-----------------------------\n");
        } else {
            console.log("❌ No se encontró el script.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

dumpVideoAppScript();
