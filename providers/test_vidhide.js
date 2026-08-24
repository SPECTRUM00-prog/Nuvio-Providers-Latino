// Desempaquetador Dean Edwards compatible con Hermes
function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const match = packed.match(regex);
        if (!match) return null;

        let [, p, a, , k] = match;
        p = p.slice(1, -1);
        const words = k.split("|");
        const radix = parseInt(a, 10);

        const unbase = (val, base) => {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            let res = 0;
            for (let i = 0; i < val.length; i++) {
                res = res * base + chars.indexOf(val[i]);
            }
            return res;
        };

        const unpacked = p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });

        return unpacked;
    } catch {
        return null;
    }
}

// Extractor VidHide / MinoChinos
async function testVidHide(url) {
    console.log(`[VidHide] Probando: ${url}`);
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://sololatino.net/"
            },
            redirect: "follow"
        });

        const html = await res.text();

        // 1. Detección directa de .m3u8
        let directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (directMatch) {
            console.log("\n✅ ¡Stream encontrado de forma directa!");
            console.log("URL:", directMatch[1]);
            return;
        }

        // 2. Desempaquetado JS
        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
            if (m3u8Match) {
                console.log("\n✅ ¡Stream desempaquetado con éxito!");
                console.log("URL:", m3u8Match[0].replace(/\\/g, ""));
                return;
            }
        }

        console.log("❌ No se encontró enlace HLS. Tamaño HTML:", html.length);
    } catch (e) {
        console.error("Error en VidHide:", e.message);
    }
}

// Ejecuta con una URL de VidHide que tengas de SoloLatino/Embed69
// Ejemplo de prueba:
testVidHide("https://minochinos.com/v/agapjo0vfrcb");
