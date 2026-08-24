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

async function resolveHgLinkDynamically(testUrl) {
    console.log(`=== RESOLVIENDO REDIRECCIÓN DE HGLINK ===`);
    console.log(`URL de entrada: ${testUrl}`);

    try {
        // 1. Descargar el script de hglink
        const jsRes = await fetch("https://hglink.to/main.js?v=1.1.9", {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://hglink.to/" }
        });
        const jsCode = await jsRes.text();

        // 2. Simular window.location para ejecutar la lógica de redirección
        let resolvedFinalUrl = null;
        const mockWindow = {
            location: {
                href: testUrl,
                pathname: new URL(testUrl).pathname,
                search: new URL(testUrl).search,
                hostname: new URL(testUrl).hostname
            }
        };

        // Creamos una función segura para extraer el destination
        const sandboxFunc = new Function("window", jsCode);
        sandboxFunc(mockWindow);

        resolvedFinalUrl = mockWindow.location.href;
        console.log(`\n✅ ¡URL real de StreamWish descubierta!`);
        console.log(`Destino: ${resolvedFinalUrl}`);

        // 3. Consultar la página real de StreamWish
        console.log(`\nConsultando reproductor final en: ${resolvedFinalUrl}...`);
        const playerRes = await fetch(resolvedFinalUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": resolvedFinalUrl
            }
        });
        const playerHtml = await playerRes.text();
        console.log(`Tamaño HTML del reproductor: ${playerHtml.length} caracteres`);

        // 4. Extraer el .m3u8
        const direct = playerHtml.match(/(?:file|sources)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (direct) {
            console.log("\n🎉 ¡STREAM HLS ENCONTRADO DIRECTO!");
            console.log("URL:", direct[1]);
            return;
        }

        const unpacked = unpackJS(playerHtml);
        if (unpacked) {
            const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i) ||
                              unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8Match) {
                const streamUrl = (m3u8Match[1] || m3u8Match[0]).replace(/\\/g, "");
                console.log("\n🎉 ¡STREAM HLS DESEMPAQUETADO CON ÉXITO!");
                console.log("URL:", streamUrl);
                return;
            }
        }

        console.log("❌ No se encontró .m3u8 en la página final.");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

resolveHgLinkDynamically("https://hglink.to/e/hzf2gnqi94cn");
