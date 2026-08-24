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

async function testVideoAppEndpoint() {
    const embedUrl = "https://videoapp.zip/e/movie/1084244";
    console.log(`=== CONSULTANDO REPRODUCTOR VIDEOAPP: ${embedUrl} ===`);

    try {
        const pageRes = await fetch(embedUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://www.cinecalidad.am/"
            }
        });
        const html = await pageRes.text();

        const tokenMatch = html.match(/var\s+cfToken\s*=\s*["']([^"']+)["']/i) ||
                           html.match(/cfToken\s*=\s*["']([^"']+)["']/i);

        if (!tokenMatch) {
            console.log("❌ No se encontró cfToken.");
            return;
        }

        const jwt = tokenMatch[1];
        const payload = JSON.parse(decodeB64(jwt.split(".")[1]));
        const targetEndpoint = payload.ee || "https://videoapp.zip/_/r";

        console.log(`\nEndpoint descubierto: ${targetEndpoint}`);
        console.log(`Parámetro p: ${payload.p}`);

        // Intento 1: Petición POST con JSON
        console.log("\n[1] Probando POST con payload...");
        const postRes = await fetch(targetEndpoint, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": embedUrl,
                "Content-Type": "application/json",
                "x-token": jwt
            },
            body: JSON.stringify({
                p: payload.p,
                sid: payload.sid,
                token: jwt
            })
        });

        console.log(`Status POST: ${postRes.status}`);
        const postText = await postRes.text();
        console.log("Respuesta POST:", postText.substring(0, 300));

        // Intento 2: Petición GET con parámetro ?p=
        if (postRes.status !== 200) {
            console.log("\n[2] Probando GET...");
            const getRes = await fetch(`${targetEndpoint}?p=${encodeURIComponent(payload.p)}&token=${encodeURIComponent(jwt)}`, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Referer": embedUrl
                }
            });
            console.log(`Status GET: ${getRes.status}`);
            const getText = await getRes.text();
            console.log("Respuesta GET:", getText.substring(0, 300));
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

testVideoAppEndpoint();
