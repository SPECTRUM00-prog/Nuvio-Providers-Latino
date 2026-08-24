// Decodificador Base64 universal
function decodeB64(str) {
    if (!str) return null;
    try {
        let clean = str.replace(/-/g, "+").replace(/_/g, "/").trim();
        while (clean.length % 4) clean += "=";
        return typeof atob !== "undefined" ? atob(clean) : Buffer.from(clean, "base64").toString("utf8");
    } catch {
        return null;
    }
}

async function testVOE() {
    console.log("Conectando con servidor VOE...");
    const url = "https://voe.sx/e/agapjo0vfrcb";

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://sololatino.net/"
            },
            redirect: "follow"
        });

        const html = await res.text();

        // 1. Método A: Buscar JSON ofuscado de VOE
        const jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch) {
            try {
                let enc = JSON.parse(jsonMatch[1].trim());
                if (Array.isArray(enc)) enc = enc[0];
                let rot = enc.replace(/[a-zA-Z]/g, c => {
                    const code = c.charCodeAt(0);
                    const limit = c <= "Z" ? 90 : 122;
                    return String.fromCharCode(limit >= code + 13 ? code + 13 : code - 13);
                });
                ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(n => rot = rot.split(n).join(""));
                const b64 = decodeB64(rot);
                if (b64) {
                    let shifted = "";
                    for (let i = 0; i < b64.length; i++) shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
                    const decrypted = decodeB64(shifted.split("").reverse().join(""));
                    const data = JSON.parse(decrypted);
                    if (data && (data.source || data.direct_access_url)) {
                        console.log("\n✅ ¡Stream VOE extraído con éxito (Método JSON)!");
                        console.log("URL:", data.source || data.direct_access_url);
                        return;
                    }
                }
            } catch (e) {
                console.log("Fallo método JSON:", e.message);
            }
        }

        // 2. Método B: Fallback buscando enlaces directos en el HTML
        const directMatch = html.match(/(?:mp4|hls)'\s*:\s*'([^']+)'/i) || 
                            html.match(/(?:mp4|hls)"\s*:\s*"([^"]+)"/i) ||
                            html.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/i);

        if (directMatch) {
            let streamUrl = directMatch[1] || directMatch[0];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            console.log("\n✅ ¡Stream VOE extraído con éxito (Método Directo)!");
            console.log("URL:", streamUrl);
        } else {
            console.log("❌ No se encontró enlace de video en VOE");
        }
    } catch (e) {
        console.error("Error en VOE:", e.message);
    }
}

testVOE();
