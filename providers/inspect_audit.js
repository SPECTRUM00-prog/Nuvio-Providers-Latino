/**
 * Auditoría conjunta: PelisPlus (tioplus.app) + StreamWish (JKAnime & SoloLatino)
 * Ejecución: node providers/inspect_audit.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = { "User-Agent": USER_AGENT };

function decodeBase64Safe(input) {
    if (!input) return "";
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) str += "=";
    var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
    str = str.replace(/[^A-Za-z0-9+/=]/g, "");
    while (i < str.length) {
        enc1 = b64.indexOf(str.charAt(i++)); enc2 = b64.indexOf(str.charAt(i++));
        enc3 = b64.indexOf(str.charAt(i++)); enc4 = b64.indexOf(str.charAt(i++));
        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;
        output += String.fromCharCode(chr1);
        if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
        if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
    }
    return output;
}

function unpackDeanEdwards(p, a, c, k) {
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
console.log(">>> [1/3] PROBANDO ESTADO DE PELISPLUS (tioplus.app) <<<");
console.log("=================================================================");

console.time("Tiempo de respuesta PelisPlus");
fetch("https://tioplus.app/", { headers: headers })
.then(function(res) {
    console.timeEnd("Tiempo de respuesta PelisPlus");
    console.log("-> Status HTTP:", res.status, res.statusText);
    console.log("-> URL final:", res.url);
    return res.text();
})
.then(function(html) {
    console.log("-> Bytes recibidos de tioplus.app:", html.length);
    if (html.length < 500) console.log("-> Muestra:", html);
})
.catch(function(err) {
    console.timeEnd("Tiempo de respuesta PelisPlus");
    console.log("[-] ERROR CRÍTICO EN PELISPLUS:", err.message);
    if (err.cause) console.log("[-] Causa:", err.cause);
})
.then(function() {
    console.log("\n=================================================================");
    console.log(">>> [2/3] AUDITANDO STREAMWISH EN JKANIME (Episodio de tu captura) <<<");
    console.log("=================================================================");

    var jkanimeUrl = "https://jkanime.net/koko-wa-ore-ni-makasete-saki-ni-ike-to-itte-kara-10-nen-ga-tattara-densetsu-ni-natteita/10/";
    console.log("Descargando:", jkanimeUrl);

    return fetch(jkanimeUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://jkanime.net/" } })
    .then(function(r) { return r.text(); })
    .then(function(jkHtml) {
        // Extraer servidores de var servers = [...]
        var sMatch = jkHtml.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
        var wishUrl = null;

        if (sMatch) {
            try {
                var sArr = JSON.parse(sMatch[1]);
                for (var i = 0; i < sArr.length; i++) {
                    var dec = decodeBase64Safe(sArr[i].remote);
                    if (dec.indexOf("streamwish") !== -1 || dec.indexOf("wish") !== -1 || dec.indexOf("hglink") !== -1 || dec.indexOf("hlswish") !== -1) {
                        wishUrl = dec;
                        console.log("[+] StreamWish encontrado en JKAnime:", wishUrl);
                        break;
                    }
                }
            } catch(e) {}
        }

        if (wishUrl) {
            return testStreamWishLocker(wishUrl);
        } else {
            console.log("[-] No se encontró StreamWish en este capítulo de JKAnime.");
        }
    });
})
.then(function() {
    console.log("\n=================================================================");
    console.log(">>> [3/3] AUDITANDO STREAMWISH EN SOLOLATINO (La isla olvidada) <<<");
    console.log("=================================================================");

    var slUrl = "https://sololatino.net/pelicula/la-isla-olvidada";
    console.log("Descargando:", slUrl);

    return fetch(slUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://sololatino.net/" } })
    .then(function(r) { return r.text(); })
    .then(function(slHtml) {
        // Extraer el enlace de StreamWish
        var wishMatch = slHtml.match(/https?:\/\/[a-zA-Z0-9.-]*(?:streamwish|hglink|hlswish|flaswish)[^\s"'<>]+/i);
        if (wishMatch) {
            console.log("[+] StreamWish detectado en SoloLatino:", wishMatch[0]);
            return testStreamWishLocker(wishMatch[0]);
        } else {
            console.log("[-] Buscando tokens de embed69...");
            var imdbMatch = slHtml.match(/tt\d+/);
            if (imdbMatch) {
                console.log("[+] IMDb detectado:", imdbMatch[0]);
            }
        }
    });
})
.catch(function(err) {
    console.error("[-] ERROR GENERAL:", err.message);
});

function testStreamWishLocker(rawUrl) {
    console.log("-> Conectando a StreamWish:", rawUrl);
    return fetch(rawUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": rawUrl
        },
        redirect: "follow"
    })
    .then(function(res) {
        console.log("   HTTP Status:", res.status);
        console.log("   URL final:", res.url);
        return res.text();
    })
    .then(function(html) {
        console.log("   Tamaño HTML:", html.length, "bytes");

        var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (packMatch) {
            var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
            var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                console.log("   [+] ¡M3U8 EXTRAÍDO DE STREAMWISH CON ÉXITO!:\n   " + m3u8[0]);
                return;
            }
        }
        var direct = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
        if (direct) {
            console.log("   [+] M3U8 Directo encontrado:", direct[0]);
        } else {
            console.log("   [-] No se encontró M3U8 en este locker.");
        }
    })
    .catch(function(e) {
        console.log("   [-] Fallo al consultar StreamWish:", e.message);
        if (e.cause) console.log("   [-] Causa:", e.cause);
    });
}
