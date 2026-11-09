/**
 * Inspección del HTML real de StreamWish y VidHide
 * Ejecución: node providers/inspect_sololatino.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var wishUrl = "https://hglink.to/e/z773lo7bqkb2";
var vidhideUrl = "https://morencius.com/embed/5a0nt9rfcnxn";

function unpackUniversal(html) {
    if (!html) return "";
    // Regex flexible que acepta comillas simples ('), dobles (") y espacios
    var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/);
    if (!packMatch) {
        packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\(\s*['"]([\s\S]+?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i);
    }
    if (!packMatch) return "";

    var p = packMatch[1];
    var a = parseInt(packMatch[2], 10);
    var k = packMatch[4].split("|");

    var dict = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function decodeBase(val, radix) {
        var res = 0;
        for (var i = 0; i < val.length; i++) {
            var idx = dict.indexOf(val[i]);
            if (idx === -1) return NaN;
            res = res * radix + idx;
        }
        return res;
    }

    return p.replace(/\b([0-9a-zA-Z]+)\b/g, function(token) {
        var index = decodeBase(token, a);
        if (isNaN(index) || index >= k.length) return token;
        return (k[index] && k[index] !== "") ? k[index] : token;
    });
}

console.log("=================================================================");
console.log(">>> [1/2] AUDITANDO STREAMWISH (hglink.to) <<<");
console.log("=================================================================");

fetch(wishUrl, {
    headers: { "User-Agent": USER_AGENT, "Referer": wishUrl },
    redirect: "follow"
})
.then(function(r) { return r.text(); })
.then(function(html) {
    console.log("-> Tamaño recibido:", html.length, "bytes");

    // 1. Probar desempaquetado con regex flexible
    var unpacked = unpackUniversal(html);
    if (unpacked) {
        console.log("[+] ¡Desempaquetado con éxito!");
        var m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (m3u8Match) {
            console.log("[+] STREAM DIRECTO ENCONTRADO:\n", m3u8Match[0]);
            return;
        }
    }

    // 2. Si no es packed, buscar si viene directo en sources: o file:
    var directMatch = html.match(/(?:file|sources|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                      html.match(/["'](https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
    if (directMatch) {
        console.log("[+] Stream directo sin empaquetar:\n", directMatch[1] || directMatch[0]);
    } else {
        console.log("[-] Muestra de los scripts encontrados en StreamWish:");
        var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        for (var s = 0; s < Math.min(3, scripts.length); s++) {
            console.log("\nScript [" + (s + 1) + "]:", scripts[s].substring(0, 200).replace(/\r?\n\s*/g, " "));
        }
    }
})
.then(function() {
    console.log("\n=================================================================");
    console.log(">>> [2/2] AUDITANDO VIDHIDE (morencius.com) <<<");
    console.log("=================================================================");

    return fetch(vidhideUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        console.log("-> Tamaño recibido:", html.length, "bytes");
        var unpacked = unpackUniversal(html);
        if (unpacked) {
            var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) || 
                            unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) {
                var stream = m3u8Match[1] || m3u8Match[0];
                if (stream.indexOf("/") === 0) stream = "https://morencius.com" + stream;
                console.log("[+] STREAM DIRECTO ENCONTRADO EN VIDHIDE:\n", stream);
            }
        }
    });
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
