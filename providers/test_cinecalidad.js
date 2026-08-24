const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectDoodStream() {
    const url = "https://doodstream.com/e/yg9ke0hza0yq";
    console.log(`=== INSPECCIONANDO DOODSTREAM: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            },
            redirect: "follow"
        });

        console.log(`HTTP Status: ${res.status}`);
        console.log(`URL Final: ${res.url}`);

        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Buscar si hay redirección por JavaScript
        const jsRedirect = html.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i) ||
                           html.match(/location\.replace\(['"]([^'"]+)['"]\)/i);
        if (jsRedirect) {
            console.log(`\n➡️ Detectada redirección JS a: ${jsRedirect[1]}`);
        }

        // 2. Buscar cualquier referencia a pass_md5 o variables en scripts
        console.log("\n[Scripts y variables encontrados]");
        const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        console.log(`Total de scripts: ${scripts.length}\n`);

        scripts.forEach((s, idx) => {
            if (s.includes("pass_md5") || s.includes("token") || s.includes("makePlay") || s.includes("eval")) {
                console.log(`--- Script #${idx + 1} ---`);
                console.log(s.substring(0, 400));
                console.log("-------------------------\n");
            }
        });

        // 3. Mostrar primeros 300 caracteres del HTML si no hay scripts
        if (scripts.length === 0) {
            console.log("Fragmento del HTML recibido:");
            console.log(html.substring(0, 300));
        }

    } catch (e) {
        console.error("Error al conectar con DoodStream:", e.message);
    }
}

inspectDoodStream();
