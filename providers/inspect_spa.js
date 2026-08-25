/**
 * Analizador de Bundles Vite / API Endpoints para Zilla y Byse
 * Ejecutar con: node inspect_spa.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const targets = [
    {
        name: "Zilla HLS",
        base: "https://player.zilla-networks.com",
        bundle: "https://player.zilla-networks.com/assets/index-b0y5A--O.js",
        id: "4b607e1f2338f99bdffe0d8ceb031c29"
    },
    {
        name: "Byse Player",
        base: "https://byselapuix.com",
        bundle: "https://byselapuix.com/assets/index-DocunfmE.js",
        id: "rhg2tnppfn66"
    }
];

async function inspectBundles() {
    for (const target of targets) {
        console.log(`\n================================================================`);
        console.log(`📦 ANALIZANDO BUNDLE DE: ${target.name}`);
        console.log(`================================================================\n`);

        try {
            const res = await fetch(target.bundle, {
                headers: { "User-Agent": USER_AGENT, "Referer": target.base }
            });
            const js = await res.text();
            console.log(`Tamaño del JS: ${js.length} caracteres`);

            // 1. Buscar rutas de API y peticiones fetch / axios
            console.log("\n[Endpoints y llamadas API encontradas]");
            const apiMatches = js.match(/["'](\/(?:api|v[0-9]|player|video|source|stream|play)[^"']*)["']/gi) || [];
            const uniqueApis = [...new Set(apiMatches.map(m => m.replace(/["']/g, "")))];
            console.log("Rutas detectadas:", uniqueApis);

            // 2. Buscar fragmentos donde se llame a jwplayer o HLS
            console.log("\n[Configuración de reproducción / jwplayer]");
            const jwMatches = js.match(/.{0,100}(?:jwplayer|hls|setup|sources|file|playlist).{0,100}/gi) || [];
            jwMatches.slice(0, 5).forEach((snippet, i) => {
                console.log(`  (${i + 1}) ...${snippet}...`);
            });

            // 3. Probar llamadas a los endpoints detectados con el ID
            console.log(`\n[Probando consultas con ID: ${target.id}]`);
            for (const path of uniqueApis) {
                if (path.includes("{") || path.includes(":id") || path.endsWith("/")) {
                    const testUrl = `${target.base}${path.replace(/\{id\}|:id/, target.id)}`;
                    await testApi(testUrl, target.base);
                } else {
                    const testUrl = `${target.base}${path}/${target.id}`;
                    await testApi(testUrl, target.base);
                }
            }

        } catch (e) {
            console.error("Error analizando bundle:", e.message);
        }
    }
}

async function testApi(url, base) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://animeav1.com/",
                "Origin": "https://animeav1.com",
                "Accept": "application/json, text/plain, */*"
            }
        });
        if (res.ok) {
            const text = await res.text();
            console.log(`  ✅ [${res.status}] ${url} -> ${text.substring(0, 150)}...`);
        } else {
            console.log(`  ❌ [${res.status}] ${url}`);
        }
    } catch (e) {
        // Ignorar errores de conexión
    }
}

inspectBundles();
