// Decodificador Base64 compatible con Node.js y Hermes Engine (FireTV)
function decodeB64(input) {
    if (!input) return null;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(input).replace(/[=]+$/, "");
    if (str.length % 4 === 1) return null;
    let output = "";
    for (let bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

// Resolver VOE / JohnBeyondNation
async function resolveVOE(url, depth = 0) {
    if (depth > 3) {
        console.error("❌ Demasiadas redirecciones.");
        return null;
    }

    try {
        console.log(`[VOE] Consultando: ${url}`);
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://sololatino.net/"
            },
            redirect: "follow"
        });

        const html = await res.text();

        // 1. Detectar y seguir redirección de JavaScript (window.location.href)
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
                           html.match(/location\.replace\(['"]([^'"]+)['"]\)/i) ||
                           html.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);

        if (jsRedirect && jsRedirect[1] && jsRedirect[1] !== url) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith("/")) {
                const origin = new URL(url).origin;
                nextUrl = origin + nextUrl;
            }
            console.log(`[VOE] Siguiendo redirección a: ${nextUrl}`);
            return await resolveVOE(nextUrl, depth + 1);
        }

        // 2. Método A: Objeto sources / hls en variables JS
        const sourcesMatch = html.match(/(?:let|var|const)\s+sources\s*=\s*({[\s\S]*?});/i) ||
                             html.match(/'hls'\s*:\s*['"]([^'"]+)['"]/i) ||
                             html.match(/"hls"\s*:\s*['"]([^'"]+)['"]/i);

        if (sourcesMatch) {
            let streamUrl = null;
            if (sourcesMatch[1].startsWith("{")) {
                try {
                    const parsed = JSON.parse(sourcesMatch[1]);
                    streamUrl = parsed.hls || parsed.mp4;
                } catch {
                    const hlsInside = sourcesMatch[1].match(/'hls'\s*:\s*['"]([^'"]+)['"]/i);
                    if (hlsInside) streamUrl = hlsInside[1];
                }
            } else {
                streamUrl = sourcesMatch[1];
            }

            if (streamUrl) {
                if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
                return { url: streamUrl, quality: "1080p", server: "VOE" };
            }
        }

        // 3. Método B: JSON ofuscado (ROT13 + Base64 + Shift)
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
                    for (let i = 0; i < b64.length; i++) {
                        shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
                    }
                    const decrypted = decodeB64(shifted.split("").reverse().join(""));
                    const data = JSON.parse(decrypted);

                    const finalUrl = data?.source || data?.direct_access_url || data?.file || data?.hls;
                    if (finalUrl) {
                        return { url: finalUrl, quality: "1080p", server: "VOE" };
                    }
                }
            } catch (e) {}
        }

        // 4. Método C: Enlace directo a .m3u8 en el texto
        const directM3u8 = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);
        if (directM3u8) {
            return { url: directM3u8[0].replace(/\\/g, ""), quality: "1080p", server: "VOE" };
        }

        return null;
    } catch (e) {
        console.error("[VOE] Error:", e.message);
        return null;
    }
}

// Ejecución de prueba
async function run() {
    console.log("=== INICIANDO PRUEBA VOE ===");
    const testUrl = "https://voe.sx/e/agapjo0vfrcb";
    const result = await resolveVOE(testUrl);

    if (result) {
        console.log("\n✅ ¡Stream VOE extraído con éxito!");
        console.log("Servidor:", result.server);
        console.log("Calidad :", result.quality);
        console.log("URL     :", result.url);
    } else {
        console.log("\n❌ No se pudo extraer el enlace.");
    }
}

run();
