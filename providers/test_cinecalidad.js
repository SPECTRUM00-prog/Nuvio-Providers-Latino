const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

async function inspectEpisodeHtml() {
    const episodeUrl = "https://www.cinecalidad.am/ver-el-episodio/pablo-escobar-el-patron-del-mal-1x1/";
    console.log(`Inspeccionando: ${episodeUrl}`);

    try {
        const res = await fetch(episodeUrl, { headers: { "User-Agent": USER_AGENT } });
        const html = await res.text();

        // 1. Buscar todas las cadenas Base64 que comiencen por 'aHR0' (http/https)
        const b64Matches = html.match(/aHR0[a-zA-Z0-9+\/=_~-]+/g) || [];
        const uniqueB64 = [...new Set(b64Matches)];
        console.log(`\n[1] Cadenas Base64 de URLs encontradas: ${uniqueB64.length}`);

        uniqueB64.forEach((b64, idx) => {
            const dec = decodeB64(b64);
            if (dec && dec.startsWith("http")) {
                console.log(`  ▶ [${idx + 1}] Decodificado: ${dec}`);
            }
        });

        // 2. Extraer el bloque HTML de "VER ONLINE" para ver las etiquetas exactas
        console.log("\n[2] Bloques de botones encontrados en el HTML:");
        const buttons = html.match(/<(?:a|li|button|div)[^>]+(?:vimeos|goodstream|voe|doodstream|zopass|option)[^>]*>/gi) || [];
        buttons.slice(0, 8).forEach(b => console.log(`  ${b}`));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectEpisodeHtml();
