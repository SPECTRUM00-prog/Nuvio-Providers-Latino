/**
 * Inspección directa de reproductores en JKAnime para Mushoku Tensei S2 Part 2 Ep 3
 * Ejecutar con: node inspect_jkanime_mushoku.js
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE_URL = "https://jkanime.net";
const epUrl = "https://jkanime.net/mushoku-tensei-ii-isekai-ittara-honki-dasu-part-2/3/";

function decodeBase64Safe(input) {
    if (!input) return "";
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) str += "=";
    var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
    str = str.replace(/[^A-Za-z0-9+/=]/g, "");
    while (i < str.length) {
        enc1 = b64.indexOf(str.charAt(i++));
        enc2 = b64.indexOf(str.charAt(i++));
        enc3 = b64.indexOf(str.charAt(i++));
        enc4 = b64.indexOf(str.charAt(i++));
        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;
        output += String.fromCharCode(chr1);
        if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
        if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
    }
    return output;
}

async function inspectJK() {
    console.log(`\n================================================================`);
    console.log(`🔍 CONSULTANDO CAPÍTULO: ${epUrl}`);
    console.log(`================================================================\n`);

    try {
        const res = await fetch(epUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" }
        });

        console.log(`Status: ${res.status}`);
        const html = await res.text();
        console.log(`HTML recibido: ${html.length} bytes`);

        // 1. Extraer var servers = [...]
        const serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
        if (serversMatch) {
            console.log("\n[var servers encontrado]");
            const sArr = JSON.parse(serversMatch[1]);
            sArr.forEach((s, idx) => {
                const dec = decodeBase64Safe(s.remote);
                console.log(`  Servidor #${idx + 1}: ${s.server} -> ${dec}`);
            });
        }

        // 2. Extraer Desu / Magi
        const umRegex = /https?:\/\/jkanime\.net\/jkplayer\/(?:um|umv|uk)[^\s"'<>]+/gi;
        const umMatches = html.match(umRegex) || [];
        console.log(`\n[Reproductores internos Desu/Magi (${umMatches.length})]:`);
        umMatches.forEach(u => console.log("  ▶", u));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectJK();
