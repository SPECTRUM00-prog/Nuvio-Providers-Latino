/**
 * Herramienta de Diagnóstico e Inspección Profunda para AnimeAV1
 * Uso: node inspect_animeav1.js [slug] [episodio]
 * Ejemplo: node inspect_animeav1.js nana 1
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://animeav1.com";

const targetSlug = process.argv[2] || "nana";
const targetEp = process.argv[3] || "1";

async function inspectAnimeAV1() {
    const dataUrl = `${BASE_URL}/media/${targetSlug}/${targetEp}/__data.json`;
    console.log(`\n================================================================`);
    console.log(`🔍 [1] CONSULTANDO SVELTEKIT DATA: ${dataUrl}`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(dataUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Referer": `${BASE_URL}/`
            }
        });

        console.log(`HTTP Status: ${res.status} ${res.statusText}`);
        if (!res.ok) {
            console.log("❌ No se pudo cargar el __data.json de AnimeAV1.");
            return;
        }

        const json = await res.json();
        const nodes = json.nodes || [];
        console.log(`Nodos en el JSON: ${nodes.length}`);

        // 1. Extraer lista completa de embeds
        const embedsFound = [];

        for (let n = 0; n < nodes.length; n++) {
            const node = nodes[n];
            if (!node || !Array.isArray(node.data)) continue;
            const dataArr = node.data;

            for (let i = 0; i < dataArr.length; i++) {
                const item = dataArr[i];
                if (item && typeof item === "object" && typeof item.embeds === "number") {
                    const embedsObj = dataArr[item.embeds];
                    if (embedsObj && typeof embedsObj === "object") {
                        for (const langKey of Object.keys(embedsObj)) {
                            const listIdx = embedsObj[langKey];
                            if (typeof listIdx === "number") {
                                const srvList = dataArr[listIdx];
                                if (Array.isArray(srvList)) {
                                    for (let j = 0; j < srvList.length; j++) {
                                        const srvItem = dataArr[srvList[j]];
                                        if (srvItem && typeof srvItem === "object") {
                                            const sName = dataArr[srvItem.server] || "Desconocido";
                                            const sUrl = dataArr[srvItem.url] || "";
                                            if (sUrl && sUrl.startsWith("http")) {
                                                embedsFound.push({
                                                    lang: langKey,
                                                    server: sName,
                                                    url: sUrl
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log(`\n✅ Total de reproductores indexados: ${embedsFound.length}\n`);
        embedsFound.forEach((emb, idx) => {
            console.log(`  [${idx + 1}] [${emb.lang}] ${emb.server.toUpperCase()} -> ${emb.url}`);
        });

        // 2. Inspección profunda de cada servidor
        console.log(`\n================================================================`);
        console.log(`🔬 [2] INSPECCIÓN Y DEVELACIÓN DE ENLACES DE VIDEO DIRECTO`);
        console.log(`================================================================\n`);

        for (let i = 0; i < embedsFound.length; i++) {
            const emb = embedsFound[i];
            console.log(`----------------------------------------------------------------`);
            console.log(`▶ Probando Servidor #${i + 1}: [${emb.lang}] ${emb.server} (${emb.url})`);
            console.log(`----------------------------------------------------------------`);

            await probeServer(emb.url, emb.server);
        }

    } catch (e) {
        console.error("Error crítico durante la inspección:", e);
    }
}

async function probeServer(url, serverName) {
    const headersToTest = {
        "User-Agent": USER_AGENT,
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site"
    };

    try {
        const res = await fetch(url, {
            headers: headersToTest,
            redirect: "follow"
        });

        console.log(`  - Status: ${res.status} ${res.statusText}`);
        console.log(`  - URL Final: ${res.url}`);
        const cType = res.headers.get("content-type") || "";
        console.log(`  - Content-Type: ${cType}`);

        if (cType.includes("mpegurl") || res.url.includes(".m3u8")) {
            console.log(`  🎯 ¡STREAM HLS DIRECTO ENCONTRADO!`);
            const m3uText = await res.text();
            console.log(`  - Primeras 4 líneas del playlist:\n${m3uText.split("\n").slice(0, 4).join("\n")}`);
            return;
        }

        const html = await res.text();
        console.log(`  - Tamaño HTML: ${html.length} bytes`);

        // Caso 1: Zilla Networks / HLS player
        if (url.includes("zilla-networks") || serverName.toLowerCase().includes("zilla") || serverName.toLowerCase().includes("hls")) {
            // Analizar scripts y fuentes
            const m3u8Matches = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/gi) || [];
            if (m3u8Matches.length > 0) {
                console.log(`  🎯 M3U8 encontrado en el HTML de Zilla:`);
                m3u8Matches.forEach(m => console.log(`     -> ${m}`));
            } else {
                console.log(`  ⚠️ No se encontró .m3u8 explícito en texto plano.`);
            }

            // Buscar tokens o variables en scripts
            const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
            console.log(`  - Total de scripts en Zilla: ${scripts.length}`);
            scripts.forEach((s, idx) => {
                if (s.includes("eval") || s.includes("source") || s.includes("player") || s.includes("hls") || s.includes("http")) {
                    console.log(`    [Script #${idx + 1}]: ${s.substring(0, 200).replace(/\s+/g, " ")}...`);
                }
            });
        }

        // Caso 2: MP4Upload
        if (url.includes("mp4upload")) {
            const directMatch = html.match(/https?:\/\/[a-zA-Z0-9.-]+\.mp4upload\.com(?::\d+)?\/[a-zA-Z0-9/._-]+\.mp4/i);
            if (directMatch) {
                console.log(`  🎯 MP4Upload Directo: ${directMatch[0]}`);
            } else {
                const packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
                if (packMatch) console.log(`  🎯 MP4Upload Packed Dean Edwards detectado.`);
            }
        }

        // Caso 3: VOE / Otros
        if (url.includes("voe.sx") || url.includes("voe.")) {
            const voeHls = html.match(/["']hls["']\s*:\s*["']([^"']+)["']/i) ||
                           html.match(/prompt\(['"]Node['"],\s*['"]([^'"]+)['"]\)/i);
            if (voeHls) {
                console.log(`  🎯 VOE Stream encontrado: ${voeHls[1]}`);
            } else {
                console.log(`  ⚠️ VOE protegido / WAF.`);
            }
        }

    } catch (err) {
        console.log(`  ❌ Error al conectar: ${err.message}`);
    }
}

inspectAnimeAV1();
