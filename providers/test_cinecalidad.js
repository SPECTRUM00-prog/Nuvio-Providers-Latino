const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

async function testVideoApp() {
    const url = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== PROBANDO VIDEOAPP: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            },
            redirect: "follow"
        });

        console.log(`Status: ${res.status} | URL Final: ${res.url}`);
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // 1. Detección directa en sources / file / src
        const direct = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                       html.match(/<source[^>]+src=["']([^"']+)["']/i);
        if (direct) {
            console.log("\n🎉 ¡STREAM ENCONTRADO DIRECTO EN VIDEOAPP!");
            console.log("URL:", direct[1]);
            return;
        }

        // 2. Desempaquetado JS
        const unpacked = unpackJS(html);
        if (unpacked) {
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/i);
            if (m3u8) {
                console.log("\n🎉 ¡STREAM DESEMPAQUETADO CON ÉXITO EN VIDEOAPP!");
                console.log("URL:", m3u8[0].replace(/\\/g, ""));
                return;
            }
        }

        console.log("\nFragmento del HTML recibido:");
        console.log(html.substring(0, 400));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

testVideoApp();
