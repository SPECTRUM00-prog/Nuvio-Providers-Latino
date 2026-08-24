// Decodificador Base64 puro (100% compatible con Node.js y Hermes Engine / FireTV)
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

// Función para resolver VOE con soporte de redirecciones en JS y múltiples métodos de extracción
async function resolveVOE(url, depth = 0) {
    if (depth > 3) {
        console.error("❌ Demasiadas redirecciones en VOE");
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

        // 1. Detectar redirección por JavaScript
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
                           html.match(/location\.replace\(['"]([^'"]+)['"]\)/i);

        if (jsRedirect && jsRedirect[1] && jsRedirect[1] !== url) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith("/")) {
                const origin = new URL(url).origin;
                nextUrl = origin + nextUrl;
            }
            console.log(`[VOE] Siguiendo redirección JS -> ${nextUrl}`);
            return await resolveVOE(nextUrl, depth + 1);
        }

        // 2. Método A: JSON Ofuscado (ROT13 + Base64 + Caesar shift + reverse)
        const jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch) {
            try {
                let enc = JSON.parse(jsonMatch[1].trim());
                if (Array.isArray(enc)) enc = enc[0];

                // ROT13
                let rot = enc.replace(/[a-zA-Z]/g, c => {
                    const code = c.charCodeAt(0);
                    const limit = c <= "Z" ? 90 : 122;
                    return String.fromCharCode(limit >= code + 13 ? code + 13 : code - 13);
                });

                // Limpieza de caracteres de relleno
                ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(n => rot = rot.split(n).join(""));

                const b64 = decodeB64(rot);
                if (b64) {
                    // Caesar shift (-3)
                    let shifted = "";
                    for (let i = 0; i < b64.length; i++) {
                        shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
                    }
                    // Reverse & Base64 decode
                    const decrypted = decodeB64(shifted.split("").reverse().join(""));
                    const data = JSON.parse(decrypted);

                    const streamUrl = data?.source || data?.direct_access_url || data?.file || data?.hls;
                    if (streamUrl) {
                        return { url: streamUrl, method: "JSON Encrypted" };
                    }
                }
            } catch (e) {
                console.log("[VOE] Falló parseo de JSON:", e.message);
            }
        }

        // 3. Método B: Detección en variable sources / hls / mp4
        const sourcesMatch = html.match(/(?:let|var|const)\s+sources\s*=\s*({[\s\S]*?});/i) ||
                             html.match(/sources\s*=\s*({[\s\S]*?});/i);
        if (sourcesMatch) {
            try {
                const parsed = JSON.parse(sourcesMatch[1]);
                let streamUrl = parsed.hls || parsed.mp4;
                if (streamUrl) {
                    if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
                    return { url: streamUrl, method: "Sources Object" };
                }
            } catch {}
        }

        // 4. Método C: Enlaces HLS codificados en Base64 o directos
        const directMatch = html.match(/'hls'\s*:\s*'([^']+)'/i) ||
                            html.match(/"hls"\s*:\s*"([^"]+)"/i) ||
                            html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i);

        if (directMatch) {
            let streamUrl = directMatch[1] || directMatch[0];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            return { url: streamUrl, method: "Direct HLS regex" };
        }

        console.log("⚠️ No se pudo extraer el enlace. Fragmento del HTML recibido:", html.substring(0, 300));
        return null;

    } catch (e) {
        console.error("Error en VOE:", e.message);
        return null;
    }
}

// Ejecutar prueba
async function runTest() {
    console.log("=== INICIANDO PRUEBA VOE ===");
    const testUrl = "https://voe.sx/e/agapjo0vfrcb";
    const result = await resolveVOE(testUrl);

    if (result) {
        console.log("\n✅ ¡Stream VOE extraído con éxito!");
        console.log("Método:", result.method);
        console.log("URL:", result.url);
    } else {
        console.log("\n❌ No se encontró ningún stream reproducible.");
    }
}

runTest();
