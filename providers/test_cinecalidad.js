/**
 * Script de prueba aislado para StreamWish y VOE
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 1. DECODIFICADOR BASE64 PURO
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

// 2. DESEMPAQUETADOR DEAN EDWARDS (StreamWish)
function unpackJS(packed) {
    try {
        const regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        const match = packed.match(regex);
        if (!match) return null;

        let [, p, a, , k] = match;
        p = p.slice(1, -1);
        const words = k.split("|");
        const radix = parseInt(a, 10);

        const unbase = (val, base) => {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            let res = 0;
            for (let i = 0; i < val.length; i++) {
                res = res * base + chars.indexOf(val[i]);
            }
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, (token) => {
            const idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch {
        return null;
    }
}

// 3. PROBADOR DE STREAMWISH (HGLINK / HLSWISH)
async function testStreamWish(url) {
    console.log(`\n=========================================`);
    console.log(`[StreamWish] Probando URL: ${url}`);
    console.log(`=========================================`);

    // Normalizar a ruta embed si viene con /v/
    const targetUrl = url.replace("/v/", "/e/");

    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": targetUrl,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            },
            redirect: "follow"
        });

        console.log(`HTTP Status: ${res.status} | URL Final: ${res.url}`);
        const html = await res.text();
        console.log(`Tamaño HTML recibido: ${html.length} caracteres`);

        // Intento A: Detección directa en propiedades sources/file/jwplayer
        const directMatch = html.match(/(?:file|sources)\s*:\s*["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i) ||
                            html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        if (directMatch) {
            console.log("✅ ¡StreamWish resuelto por coincidencia directa!");
            console.log("URL .m3u8:", directMatch[1]);
            return;
        }

        // Intento B: Desempaquetado JS
        const unpacked = unpackJS(html);
        if (unpacked) {
            console.log("Script empaquetado detectado. Desempaquetando...");
            const m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i) ||
                         unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
            if (m3u8) {
                const finalUrl = (m3u8[1] || m3u8[0]).replace(/\\/g, "");
                console.log("✅ ¡StreamWish desempaquetado con éxito!");
                console.log("URL .m3u8:", finalUrl);
                return;
            }
        }

        console.log("❌ No se encontró .m3u8 en StreamWish.");
        console.log("Muestra del HTML:", html.substring(0, 300));

    } catch (e) {
        console.error("Error en StreamWish:", e.message);
    }
}

// 4. PROBADOR DE VOE
async function testVOE(url, depth = 0) {
    if (depth === 0) {
        console.log(`\n=========================================`);
        console.log(`[VOE] Probando URL: ${url}`);
        console.log(`=========================================`);
    }

    if (depth > 3) {
        console.log("❌ Demasiadas redirecciones.");
        return;
    }

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://sololatino.net/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            },
            redirect: "follow"
        });

        console.log(`[Depth ${depth}] HTTP Status: ${res.status} | URL: ${res.url}`);
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // Comprobar redirección JS
        const jsRedirect = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
                           html.match(/location\.replace\(['"]([^'"]+)['"]\)/i);

        if (jsRedirect && jsRedirect[1] && jsRedirect[1] !== url) {
            let nextUrl = jsRedirect[1];
            if (nextUrl.startsWith("/")) nextUrl = new URL(url).origin + nextUrl;
            console.log(`Redirección JS detectada -> ${nextUrl}`);
            return await testVOE(nextUrl, depth + 1);
        }

        // Comprobar presencia de Altcha / Protección
        if (html.includes("altcha") || html.includes("access-form")) {
            console.log("⚠️ VOE presentó la pantalla de verificación ALTCHA (Proof of Work).");
            return;
        }

        // Detección directa HLS
        const direct = html.match(/'hls'\s*:\s*['"]([^'"]+)['"]/i) || html.match(/"hls"\s*:\s*['"]([^'"]+)['"]/i);
        if (direct) {
            let streamUrl = direct[1];
            if (streamUrl.startsWith("aHR0")) streamUrl = decodeB64(streamUrl);
            console.log("✅ ¡VOE resuelto con éxito!");
            console.log("URL:", streamUrl);
            return;
        }

        console.log("❌ No se encontró enlace en VOE.");
        console.log("Muestra del HTML:", html.substring(0, 300));

    } catch (e) {
        console.error("Error en VOE:", e.message);
    }
}

// Ejecutar pruebas con URLs reales obtenidas en las sesiones
async function runTests() {
    // 1. Probar StreamWish (enlace de Deadpool / SoloLatino)
    await testStreamWish("https://hglink.to/e/hzf2gnqi94cn");

    // 2. Probar VOE (enlace de SoloLatino)
    await testVOE("https://voe.sx/e/ypw5fgaup7su");
}

runTests();
