const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const TARGET_URL = "https://www.cinecalidad.am/ver-pelicula/toy-story-5/";

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

async function inspectCinecalidadServers() {
    console.log(`=== INSPECCIONANDO SERVIDORES EN: ${TARGET_URL} ===`);

    try {
        const res = await fetch(TARGET_URL, {
            headers: { "User-Agent": USER_AGENT, "Referer": "https://www.cinecalidad.am/" }
        });
        const html = await res.text();

        console.log(`\n[1] Botones encontrados en el HTML:`);
        const optionRegex = /<(?:li|a|button|div)[^>]+data-option=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:li|a|button|div)>/gi;
        let match;
        
        while ((match = optionRegex.exec(html)) !== null) {
            let rawOption = match[1];
            let label = match[2].replace(/<[^>]+>/g, '').trim();

            if (rawOption.includes("zopass=")) {
                const b64 = rawOption.split("zopass=")[1].split("&")[0];
                const dec = decodeB64(b64);
                console.log(`▶ [${label || 'Servidor'}] -> ${dec}`);
            } else if (rawOption.startsWith("http") && !rawOption.includes("youtube.com")) {
                console.log(`▶ [${label || 'Servidor'}] -> ${rawOption}`);
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectCinecalidadServers();
