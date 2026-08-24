const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function decodeB64(input) {
    if (!input) return null;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(input).replace(/-/g, "+").replace(/_/g, "/").replace(/[=]+$/, "");
    if (str.length % 4 === 1) return null;
    let output = "";
    for (let bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

async function decodeVideoAppToken() {
    const url = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== ANALIZANDO TOKEN DE VIDEOAPP: ${url} ===`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            },
            redirect: "follow"
        });

        const html = await res.text();

        // 1. Extraer el token JWT
        const tokenMatch = html.match(/var\s+cfToken\s*=\s*["']([^"']+)["']/i) ||
                           html.match(/cfToken\s*=\s*["']([^"']+)["']/i);

        if (tokenMatch) {
            const jwt = tokenMatch[1];
            const parts = jwt.split(".");
            
            if (parts.length >= 2) {
                const payloadJson = decodeB64(parts[1]);
                console.log("\n✅ ¡Token JWT decodificado con éxito!");
                
                try {
                    const data = JSON.parse(payloadJson);
                    console.log("Contenido del Payload JSON:");
                    console.log(JSON.stringify(data, null, 2));
                } catch {
                    console.log("Payload en texto plano:", payloadJson);
                }
            }
        } else {
            console.log("❌ No se encontró la variable cfToken.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

decodeVideoAppToken();
