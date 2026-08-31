/**
 * Inspección rápida de PelisPedia
 * Ejecutar con: node inspect_pelispedia.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function checkPelisPedia() {
    const searchUrl = "https://pelispedia.mov/search?s=la+casa+de+los+dibujos";
    console.log(`\n🔍 Comprobando: ${searchUrl}`);

    try {
        const res = await fetch(searchUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": "https://pelispedia.mov/"
            },
            redirect: "follow"
        });

        console.log(`📡 Status: ${res.status} ${res.statusText}`);
        console.log(`☁️ Cloudflare: ${res.headers.get("cf-ray") ? "Detectado (CF-RAY: " + res.headers.get("cf-ray") + ")" : "No detectado"}`);

        const html = await res.text();
        console.log(`📄 Longitud HTML: ${html.length} caracteres`);

        if (html.includes("Just a moment...") || html.includes("cf-browser-verification")) {
            console.log(`❌ BLOQUEADO por Cloudflare WAF (Challenge activo).`);
        } else if (html.includes("/serie/la-casa-de-los-dibujos")) {
            console.log(`✅ ¡ÉXITO! Búsqueda abierta y accesible sin bloqueos.`);
            
            // Probar episodio
            const epUrl = "https://pelispedia.mov/serie/la-casa-de-los-dibujos/temporada/1/capitulo/1";
            console.log(`\n🔍 Comprobando episodio: ${epUrl}`);
            const resEp = await fetch(epUrl, { headers: { "User-Agent": USER_AGENT } });
            const htmlEp = await resEp.text();
            console.log(`📡 Status Episodio: ${resEp.status} (${htmlEp.length} bytes)`);
            
            const iframe = htmlEp.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframe) {
                console.log(`🎬 Iframe detectado: ${iframe[1]}`);
            }
        } else {
            console.log(`⚠️ Respuesta recibida sin bloqueo, revisando contenido...`);
            console.log(html.substring(0, 300));
        }

    } catch (e) {
        console.error(`❌ Error de conexión: ${e.message}`);
    }
}

checkPelisPedia();
