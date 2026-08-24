// Test de Diagnóstico VOE
async function debugVOE() {
    const url = "https://voe.sx/e/agapjo0vfrcb";
    console.log(`[1] Conectando a: ${url}`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
            },
            redirect: "follow"
        });

        console.log(`[2] HTTP Status: ${res.status} ${res.statusText}`);
        console.log(`[3] URL final: ${res.url}`);

        const html = await res.text();
        console.log(`[4] Tamaño del HTML: ${html.length} caracteres`);

        // Comprobar si el archivo fue eliminado
        if (html.includes("File Not Found") || html.includes("deleted") || html.includes("404")) {
            console.log("\n❌ El archivo en VOE fue eliminado o no existe.");
            return;
        }

        // Comprobar si hay redirección JS
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
        if (jsRedirect) {
            console.log(`\n➡️ Detectada redirección JS a: ${jsRedirect[1]}`);
        }

        // Imprimir las etiquetas <script> encontradas
        console.log("\n[5] Scripts encontrados en el HTML:");
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        scripts.forEach((s, idx) => {
            console.log(`\n--- Script #${idx + 1} ---`);
            console.log(s.substring(0, 300) + (s.length > 300 ? "..." : ""));
        });

    } catch (e) {
        console.error("Error en la petición:", e.message);
    }
}

debugVOE();
