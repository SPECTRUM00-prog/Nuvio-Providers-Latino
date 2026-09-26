/**
 * Verificación del desempaquetador en GoodStream (Flix)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var TEST_URL = "https://goodstream.one/e/ddmcxni462sv";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Probando extracción de video en GoodStream (Flix)...");

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d|a-z]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var unbase = function(val, base) {
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) {
                res = res * base + dict.indexOf(val[i]);
            }
            return res;
        };

        return p.replace(/\b[0-9a-zA-Z]+\b/g, function(token) {
            var idx = unbase(token, radix);
            return words[idx] !== undefined && words[idx] !== "" ? words[idx] : token;
        });
    } catch (e) {
        return null;
    }
}

fetch(TEST_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://pelisgo.online/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    console.log("-> HTML recibido:", html.length, "caracteres");

    var unpacked = unpackJS(html);
    if (unpacked) {
        console.log("-> ¡Código desempaquetado con éxito!");
        var m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                        unpacked.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
        
        if (m3u8Match) {
            var streamUrl = (m3u8Match[1] || m3u8Match[0]).replace(/\\/g, "");
            console.log("\n=======================================================");
            console.log("[✓] ¡STREAM M3U8 DE FLIX / GOODSTREAM EXTRAÍDO!");
            console.log("    URL:", streamUrl);
            console.log("=======================================================\n");

            // Validar si el m3u8 responde en vivo
            return fetch(streamUrl, {
                headers: { "User-Agent": USER_AGENT, "Referer": TEST_URL }
            })
            .then(function(vr) {
                console.log("-> Validación en vivo HTTP:", vr.status, "(" + vr.headers.get("content-type") + ")");
            });
        } else {
            console.log("[-] No se encontró m3u8 dentro del código desempaquetado.");
            console.log("Primeros 300 carac:", unpacked.substring(0, 300));
        }
    } else {
        console.log("[-] No coincidió la expresión regular del unpacker.");
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
