const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Desempaquetador Dean Edwards
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
            for (let i = 0; i < val.length; i++) res = res * base + chars.indexOf(val[i]);
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch {
        return null;
    }
}

// Extractor directo probando los espejos activos de StreamWish
async function testStreamWishDomains() {
    const videoId = "hzf2gnqi94cn";
    console.log(`=== PROBANDO ESPEJOS ACTIVOS DE STREAMWISH (ID: ${videoId}) ===`);

    const domains = [
        "https://hlswish.com/e/",
        "https://streamwish.to/e/",
        "https://streamwish.com/e/",
        "https://swishcdn.com/e/",
        "https://dwish.pro/e/",
        "https://awish.pro/e/",
        "https://mwish.pro/e/"
    ];

    for (const base of domains) {
        const targetUrl = `${base}${videoId}`;
        console.log(`\nConsultando: ${targetUrl}...`);

        try {
            const res = await fetch(targetUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": targetUrl
                },
                redirect: "follow"
            });

            console.log(`Status: ${res.status} | URL Final: ${res.url}`);
            if (res.status !== 200) continue;

            const html = await res.text();
            console.log(`Tamaño HTML: ${html.length} caracteres`);

            // 1. Detección directa en sources / file
            const direct = html.match(/(?:file|sources)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                           html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (direct) {
                console.log("\n🎉 ¡STREAM ENCONTRADO DE FORMA DIRECTA!");
                console.log("URL:", direct[1]);
                break;
            }

            // 2. Desempaquetado JS
            const unpacked = unpackJS(html);
            if (unpacked) {
                const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i) ||
                                  unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
                if (m3u8Match) {
                    const finalUrl = (m3u8Match[1] || m3u8Match[0]).replace(/\\/g, "");
                    console.log("\n🎉 ¡STREAM DESEMPAQUETADO CON ÉXITO!");
                    console.log("URL:", finalUrl);
                    break;
                }
            }

        } catch (e) {
            console.log(`Error en ${base}:`, e.message);
        }
    }
}

testStreamWishDomains();
