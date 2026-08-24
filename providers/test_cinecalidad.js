const BASE_URL = "https://www.cinecalidad.am";
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

async function testCineCalidadSeries() {
    console.log("=== PROBANDO CINECALIDAD SERIES ===");

    // 1. Probar búsqueda
    const queries = ["Pablo Escobar", "Pablo Escobar El Patron del Mal"];
    let seriesUrl = null;

    for (const q of queries) {
        console.log(`\n[1] Buscando: "${q}"...`);
        const res = await fetch(`${BASE_URL}/?s=${encodeURIComponent(q)}`, {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await res.text();

        // Regex mejorado para capturar URLs absolutas y relativas (/ver-serie/...)
        const regex = /href=["']((?:https?:\/\/[^"']*)?\/(?:ver-serie|serie)\/[^"']+)["']/gi;
        let match;
        const found = [];
        while ((match = regex.exec(html)) !== null) {
            let full = match[1];
            if (!full.startsWith("http")) full = BASE_URL + (full.startsWith("/") ? full : "/" + full);
            if (!found.includes(full)) found.push(full);
        }

        console.log(`Resultados encontrados: ${found.length}`);
        if (found.length > 0) {
            seriesUrl = found[0];
            console.log(`✅ Ficha seleccionada: ${seriesUrl}`);
            break;
        }
    }

    if (!seriesUrl) {
        console.log("❌ No se encontró la ficha de la serie.");
        return;
    }

    // 2. Construir URL del episodio 1x1
    const slug = seriesUrl.replace(/\/$/, "").split("/").pop();
    const episodeUrl = `${BASE_URL}/ver-el-episodio/${slug}-1x1/`;
    console.log(`\n[2] Consultando episodio: ${episodeUrl}`);

    const epRes = await fetch(episodeUrl, { headers: { "User-Agent": USER_AGENT } });
    console.log(`Status del episodio: ${epRes.status}`);

    if (epRes.status === 200) {
        const epHtml = await epRes.text();
        console.log(`Tamaño HTML: ${epHtml.length} caracteres`);

        // 3. Extraer zopass (Base64)
        const zopassMatches = epHtml.match(/zopass=([a-zA-Z0-9+\/=_~-]+)/gi) || [];
        console.log(`\n[3] Enlaces zopass encontrados: ${zopassMatches.length}`);

        zopassMatches.forEach((z, i) => {
            const rawB64 = z.split("=")[1];
            const decoded = decodeB64(rawB64);
            console.log(`  [${i + 1}] Base64: ${rawB64.substring(0, 20)}... -> Decodificado: ${decoded}`);
        });
    }
}

testCineCalidadSeries();
