/**
 * Extractor del stream de GoodStream (Flix) mediante POST /dl
 * Ejecución: node providers/inspect_pelisgo.js
 */

var FILE_CODE = "ddmcxni462sv";
var POST_URL = "https://goodstream.one/dl";
var EMBED_URL = "https://goodstream.one/e/" + FILE_CODE;
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

console.log("[*] Enviando POST a GoodStream (/dl) con file_code:", FILE_CODE);

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

fetch(POST_URL, {
    method: "POST",
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": EMBED_URL,
        "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "op=embed&file_code=" + encodeURIComponent(FILE_CODE) + "&auto=1&referer=" + encodeURIComponent("https://pelisgo.online/")
})
.then(function(res) {
    console.log("-> Status HTTP del POST:", res.status, res.statusText);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML de respuesta:", html.length, "caracteres");

    var unpacked = unpackJS(html);
    var sourceText = unpacked || html;
    var m3u8Match = sourceText.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i) ||
                    sourceText.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);

    if (m3u8Match) {
        var streamUrl = (m3u8Match[1] || m3u8Match[0]).replace(/\\/g, "");
        console.log("\n=======================================================");
        console.log("[✓] ¡STREAM M3U8 DE GOODSTREAM EXTRAÍDO CON ÉXITO!");
        console.log("    URL:", streamUrl);
        console.log("=======================================================\n");

        // Probar validación en vivo del m3u8
        return fetch(streamUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": EMBED_URL }
        })
        .then(function(vr) {
            console.log("-> Validación en vivo HTTP:", vr.status, "(" + vr.headers.get("content-type") + ")");
        });
    } else {
        console.log("[-] No se encontró m3u8 en la respuesta del POST.");
        console.log("Primeros 300 caracteres:\n", html.substring(0, 300));
    }
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
