@'
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function inspectUrl(name, url, referer) {
    console.log(`\n======================================================`);
    console.log(`🔍 [${name}] URL: ${url}`);
    console.log(`======================================================`);

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Referer": referer || "https://entrepeliculasyseries.nz/"
            },
            redirect: "follow"
        });

        console.log(`📡 HTTP Status: ${res.status} ${res.statusText}`);
        console.log(`🔗 URL Final:   ${res.url}`);
        console.log(`🛡️ Servidor:    ${res.headers.get("server") || "N/A"}`);
        console.log(`☁️ Cloudflare:  ${res.headers.get("cf-ray") ? "Detectado (CF-RAY: " + res.headers.get("cf-ray") + ")" : "No detectado"}`);

        const text = await res.text();
        console.log(`📄 Longitud HTML: ${text.length} caracteres`);

        // 1. Detección de Bloqueo Cloudflare
        if (text.includes("Just a moment...") || text.includes("cf-browser-verification") || text.includes("Attention Required!")) {
            console.log(`\n❌ BLOQUEO CLOUDFLARE WAF ACTIVO (Turnstile / Challenge)`);
            console.log(`Fragmento recibido:\n${text.substring(0, 300)}...`);
            return;
        }

        // 2. Buscar iframes y enlaces de video
        const iframes = text.match(/<iframe[^>]+>/gi) || [];
        console.log(`\n🎬 Iframes encontrados (${iframes.length}):`);
        iframes.forEach((ifm, i) => console.log(`   [${i + 1}] ${ifm}`));

        // 3. Buscar enlaces a embed69, streamwish, vidhide, etc.
        const embeds = text.match(/https?:\/\/[a-zA-Z0-9.-]+(?:embed69|streamwish|vidhide|callistanise|uqload|minochinos)[^"'\s\\]*/gi) || [];
        if (embeds.length > 0) {
            console.log(`\n🔗 Enlaces de servidores detectados (${embeds.length}):`);
            embeds.forEach((e, i) => console.log(`   [${i + 1}] ${e}`));
        }

        // 4. Buscar variables criptográficas de Embed69
        if (text.includes("dataLink") || text.includes("challenge")) {
            console.log(`\n🔑 Variables criptográficas de Embed69 detectadas:`);
            const chMatch = text.match(/var\s+challenge\s*=\s*['"]([^'"]+)['"]/);
            const diffMatch = text.match(/var\s+difficulty\s*=\s*(\d+)/);
            const dataMatch = text.match(/var\s+dataLink\s*=\s*['"]([^'"]+)['"]/);
            console.log(`   - Challenge:  ${chMatch ? chMatch[1] : "No encontrado"}`);
            console.log(`   - Difficulty: ${diffMatch ? diffMatch[1] : "No encontrado"}`);
            console.log(`   - dataLink:   ${dataMatch ? dataMatch[1].substring(0, 40) + "..." : "No encontrado"}`);
        }

        // 5. Si no hubo nada, mostrar los primeros caracteres
        if (iframes.length === 0 && embeds.length === 0 && !text.includes("dataLink")) {
            console.log(`\nFragmento del HTML recibido:`);
            console.log(text.substring(0, 400));
        }

    } catch (err) {
        console.error(`❌ Error en la petición: ${err.message}`);
    }
}

async function runAudit() {
    // Test 1: Búsqueda web
    await inspectUrl("1. BÚSQUEDA WEB", "https://entrepeliculasyseries.nz/search?s=la+casa+de+los+dibujos");

    // Test 2: Página directa del episodio
    await inspectUrl("2. PÁGINA DEL EPISODIO", "https://entrepeliculasyseries.nz/serie/la-casa-de-los-dibujos/temporada/1/capitulo/1");

    // Test 3: Endpoint directo /vidurl/
    await inspectUrl("3. ENDPOINT VIDURL", "https://entrepeliculasyseries.nz/vidurl/tt0386180-1x01/");

    // Test 4: Embed69 Directo formato 1x01
    await inspectUrl("4. EMBED69 (1x01)", "https://embed69.org/f/tt0386180-1x01");

    // Test 5: Embed69 Directo formato 1x1
    await inspectUrl("5. EMBED69 (1x1)", "https://embed69.org/f/tt0386180-1x1");
}

runAudit();
'@ | Set-Content -Path "inspect_entre.js" -Encoding UTF8

node inspect_entre.js
