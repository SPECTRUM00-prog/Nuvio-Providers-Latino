/**
 * Extractor de todos los servidores de JKAnime para el capítulo de tu captura
 * Ejecución: node providers/inspect_audit.js
 */

var EPISODE_URL = "https://jkanime.net/koko-wa-ore-ni-makasete-saki-ni-ike-to-itte-kara-10-nen-ga-tattara-densetsu-ni-natteita/10/";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

console.log("=================================================================");
console.log(">>> EXTRAYENDO TODOS LOS SERVIDORES DE JKANIME (EPISODIO 10) <<<");
console.log("=================================================================\n");

fetch(EPISODE_URL, {
    headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://jkanime.net/"
    }
})
.then(function(res) { return res.text(); })
.then(function(html) {
    // 1. Extraer el array de servidores en javascript
    var serversMatch = html.match(/var\s+servers\s*=\s*(\[[^\]]+\]);/i);
    var allServers = [];

    if (serversMatch) {
        try {
            var sArr = JSON.parse(serversMatch[1]);
            for (var i = 0; i < sArr.length; i++) {
                var item = sArr[i];
                var decodedRemote = decodeBase64Safe(item.remote);
                allServers.push({
                    serverName: item.server || "Desconocido",
                    title: item.title || item.server,
                    encoded: item.remote,
                    decodedUrl: decodedRemote
                });
            }
        } catch (e) {
            console.log("[-] Error parseando var servers:", e.message);
        }
    }

    console.log("[+] Servidores encontrados en var servers (" + allServers.length + "):");
    for (var j = 0; j < allServers.length; j++) {
        var s = allServers[j];
        console.log("   [" + (j + 1) + "] " + s.serverName + " -> " + s.decodedUrl);
    }

    // 2. Extraer otros iframes o reproductores en jkplayer
    var jkPlayers = [];
    var jkRegex = /https?:\/\/jkanime\.net\/jkplayer\/[^\s"'<>]+/gi;
    var jm;
    while ((jm = jkRegex.exec(html)) !== null) {
        if (jkPlayers.indexOf(jm[0]) === -1) jkPlayers.push(jm[0]);
    }
    console.log("\n[+] Enlaces jkplayer encontrados (" + jkPlayers.length + "):");
    for (var k = 0; k < jkPlayers.length; k++) {
        console.log("   - " + jkPlayers[k]);
    }

    // 3. Probar si StreamWish o Filemoon devuelven video
    var testTargets = allServers.filter(function(x) {
        var u = x.decodedUrl.toLowerCase();
        return u.indexOf("streamwish") !== -1 || u.indexOf("wish") !== -1 || 
               u.indexOf("filemoon") !== -1 || u.indexOf("mixdrop") !== -1 ||
               u.indexOf("vidhide") !== -1;
    });

    console.log("\n=================================================================");
    console.log(">>> PROBANDO RESOLVERS PARA LOS SERVIDORES ENCONTRADOS <<<");
    console.log("=================================================================");

    function probeNext(idx) {
        if (idx >= testTargets.length) {
            console.log("=== FIN DE PRUEBAS ===");
            return;
        }

        var target = testTargets[idx];
        console.log("\n-> Probando [" + target.serverName + "]: " + target.decodedUrl);

        fetch(target.decodedUrl, {
            headers: { "User-Agent": USER_AGENT, "Referer": EPISODE_URL },
            redirect: "follow"
        })
        .then(function(r) {
            console.log("   Status:", r.status);
            console.log("   URL Final:", r.url);
            return r.text();
        })
        .then(function(txt) {
            var m3u8 = txt.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/i);
            if (m3u8) {
                console.log("   [+] ¡M3U8 DIRECTO ENCONTRADO!:", m3u8[0]);
            } else if (txt.indexOf("eval(function(p,a,c,k,e,") !== -1) {
                console.log("   [+] Código Packed Dean Edwards detectado (Listo para desempaquetar).");
            } else {
                console.log("   [-] Muestra:", txt.substring(0, 150).replace(/\r?\n\s*/g, " "));
            }
            probeNext(idx + 1);
        })
        .catch(function(err) {
            console.log("   [-] Error:", err.message);
            probeNext(idx + 1);
        });
    }

    probeNext(0);
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
