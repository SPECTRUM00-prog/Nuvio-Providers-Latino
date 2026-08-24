// Descifrador Universal de Embed69 para Nuvio
const BASE_URL = "https://embed69.org";

// 1. Decodificador Base64 puro compatible con Hermes / FireTV
function decodeB64ToBytes(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(b64).replace(/[=]+$/, "");
    let output = [];
    for (let bc = 0, bs = 0, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output.push(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return new Uint8Array(output);
}

// 2. SHA-256 en Web Crypto API
async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return new Uint8Array(hash);
}

// 3. Descifrado AES-CBC
async function decryptAES(encryptedBase64, aesKeyBytes) {
    try {
        const raw = decodeB64ToBytes(encryptedBase64);
        const iv = raw.slice(0, 16);
        const ciphertext = raw.slice(16);
        const key = await crypto.subtle.importKey("raw", aesKeyBytes.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null;
    }
}

// 4. Resolvedor de PoW y Extractor
async function getDecryptedEmbeds(imdbId) {
    const targetUrl = `${BASE_URL}/f/${imdbId}`;
    console.log(`[1] Obteniendo página: ${targetUrl}`);

    try {
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": `${BASE_URL}/`
            }
        });

        const html = await res.text();

        // Extraer parámetros PoW
        const challengeMatch = html.match(/const\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
        const difficultyMatch = html.match(/const\s+POW_DIFFICULTY\s*=\s*(\d+)/);
        const saltMatch = html.match(/const\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/);
        const dataLinkMatch = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);

        if (!challengeMatch || !dataLinkMatch) {
            console.log("❌ No se encontraron los datos de PoW en el HTML.");
            return;
        }

        const challenge = challengeMatch[1];
        const difficulty = parseInt(difficultyMatch ? difficultyMatch[1] : "3", 10);
        const salt = saltMatch ? saltMatch[1] : "";
        const dataLink = JSON.parse(dataLinkMatch[1]);

        console.log(`[2] Resolviendo PoW (Dificultad: ${difficulty})...`);
        const prefix = "0".repeat(difficulty);
        let nonce = 0;
        const startTime = Date.now();

        while (true) {
            const hash = await sha256Hex(challenge + nonce);
            if (hash.startsWith(prefix)) {
                break;
            }
            nonce++;
        }

        console.log(`✅ PoW resuelto en ${Date.now() - startTime}ms (Nonce: ${nonce})`);

        // Calcular clave AES
        const aesKey = await sha256Bytes(challenge + nonce + salt);

        console.log("\n[3] Descifrando servidores:");
        for (const file of dataLink) {
            const lang = file.video_language || "LAT";
            console.log(`\n--- Idioma: ${lang} ---`);

            if (file.sortedEmbeds) {
                for (const embed of file.sortedEmbeds) {
                    const decryptedUrl = await decryptAES(embed.link, aesKey);
                    console.log(`  ▶ [${embed.servername.toUpperCase()}] -> ${decryptedUrl}`);
                }
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

// Probar con Deadpool & Wolverine
getDecryptedEmbeds("tt6263850");
