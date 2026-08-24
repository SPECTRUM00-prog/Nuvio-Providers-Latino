async function testVidHide() {
    console.log("Conectando con VidHide (Minochinos)...");
    const url = "https://minochinos.com/embed/a6bxhj09n6zm";
    
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://sololatino.net/"
            }
        });
        const html = await res.text();

        const match = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
        if (!match) {
            console.log("❌ No se encontró el bloque eval");
            return;
        }

        const [, p, a, , k] = match;
        const words = k.split("|");
        const radix = parseInt(a, 10);

        // Desempaquetador nativo en Base 36
        const unpacked = p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = parseInt(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });

        // Buscar enlaces HLS .m3u8
        const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i) ||
                          unpacked.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i);

        if (m3u8Match) {
            console.log("\n✅ ¡Stream HLS extraído con éxito!");
            console.log("URL:", m3u8Match[0].replace(/\\/g, ""));
        } else {
            console.log("❌ Código desempaquetado:\n", unpacked.substring(0, 300));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testVidHide();
