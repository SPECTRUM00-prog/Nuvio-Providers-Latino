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
        const radix = parseInt(a);
        const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

        const unbase = (s) => s.split("").reduce((acc, c) => acc * radix + chars.indexOf(c), 0);
        const unpacked = p.replace(/\b([0-9a-zA-Z]+)\b/g, (m) => words[unbase(m)] || m);

        const m3u8 = unpacked.match(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/);

        if (m3u8) {
            console.log("\n✅ Stream extraído con éxito:");
            console.log("URL:", m3u8[0]);
        } else {
            console.log("❌ No se encontró la URL .m3u8 en el código desempaquetado");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testVidHide();
