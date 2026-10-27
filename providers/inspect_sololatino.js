/**
 * Test de los resolvers de VidHide y StreamWish
 * Ejecución: node providers/inspect_lockers.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

function testVidHide(url) {
    console.log("Probando VidHide/Morencius:", url);
    var hostMatch = url.match(/^(https?:\/\/[^/]+)/i);
    var host = hostMatch ? hostMatch[1] : "https://morencius.com";

    return fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" }, redirect: "follow" })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                var m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)['"]/i) || unpacked.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
                if (m3u8Match) {
                    var finalStream = m3u8Match[1] || m3u8Match[0];
                    if (finalStream.indexOf("/") === 0) finalStream = host + finalStream;
                    console.log("[+] ¡ÉXITO VIDHIDE! M3U8 Directo:", finalStream);
                    return finalStream;
                }
            }
            console.log("[-] No se pudo desempaquetar VidHide.");
        });
}

function testStreamWish(url) {
    console.log("\nProbando StreamWish/HgLink:", url);
    var idMatch = url.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    var targetUrl = idMatch ? "https://hlswish.com/e/" + idMatch[1] : url;

    return fetch(targetUrl, { headers: { "User-Agent": USER_AGENT, "Referer": targetUrl }, redirect: "follow" })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var packMatch = html.match(/eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]\)\{[\s\S]+?\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
            if (packMatch) {
                var unpacked = unpackDeanEdwards(packMatch[1], parseInt(packMatch[2], 10), parseInt(packMatch[3], 10), packMatch[4].split("|"));
                var m3u8 = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
                if (m3u8) {
                    console.log("[+] ¡ÉXITO STREAMWISH! M3U8 Directo:", m3u8[0]);
                    return m3u8[0];
                }
            }
            console.log("[-] No se pudo desempaquetar StreamWish.");
        });
}

testVidHide("https://morencius.com/embed/gaakactfipl6")
    .then(function() { return testStreamWish("https://hglink.to/e/hzf2gnqi94cn"); });
