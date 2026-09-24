/**
 * Diagnóstico de extracción para StreamWish (hglink), VOE y VidHide (morencius)
 * Ejecución: node providers/inspect_hosters.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var testUrls = [
    { name: "StreamWish (hglink)", url: "https://hglink.to/e/d27vn7ce07ma" },
    { name: "VOE",                 url: "https://voe.sx/e/zx7awj8hlamp" },
    { name: "VidHide (morencius)", url: "https://morencius.com/embed/g4woz770kcw2" }
];

console.log("==================================================");
console.log("[*] INSPECCIONANDO CÓDIGO FUENTE DE HOSTERES");
console.log("==================================================\n");

function unpackJS(packed) {
    try {
        var regex = /eval\(function\(p,a,c,k,e,[r|d]\)\{[\s\S]*?\}\((['"][\s\S]+?['"]),\s*(\d+),\s*(\d+),\s*['"]([\s\S]+?)['"]\.split\('\|'\)/i;
        var match = packed.match(regex);
        if (!match) return null;

        var p = match[1].slice(1, -1);
        var a = match[2];
        var k = match[4];
        var words = k.split("|");
        var radix = parseInt(a, 10);

        var unbase = function(val, base) {
            var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (base <= 36) return parseInt(val, base);
            var res = 0;
            for (var i = 0; i < val.length; i++) res = res * base + chars.indexOf(val[i]);
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

function inspect(item) {
    console.log("--------------------------------------------------");
    console.log("[*] Analizando:", item.name);
    console.log("    URL:", item.url);

    return fetch(item.url, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        redirect: "follow"
    })
    .then(function(res) {
        console.log("-> HTTP Status:", res.status, res.statusText);
        console.log("-> URL final (tras redirecciones):", res.url);
        return res.text();
    })
    .then(function(html) {
        console.log("-> Tamaño recibido:", html.length, "caracteres");

        // 1. Detección directa de .m3u8 o .mp4
        var directMatches = html.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi);
        if (directMatches) {
            console.log("[+] Enlaces directos multimedia encontrados (" + directMatches.length + "):");
            console.log(directMatches.slice(0, 3));
        } else {
            console.log("[-] No hay enlaces .m3u8 o .mp4 a la vista.");
        }

        // 2. Detección de Packer (eval)
        if (html.indexOf("eval(function(p,a,c,k,e") !== -1) {
            console.log("[+] Contiene código empaquetado (Dean Edwards). Desempaquetando...");
            var unpacked = unpackJS(html);
            if (unpacked) {
                var m3u8Unpacked = unpacked.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*/gi);
                console.log("    -> Enlaces dentro del código desempaquetado:");
                console.log(m3u8Unpacked ? m3u8Unpacked.slice(0, 3) : "Ninguno");
            }
        }

        // 3. Detección específica para VOE (variables sources o b64)
        var voeMatch = html.match(/(?:sources|hls|file)\s*[:=]\s*["']([^"']+)["']/gi) ||
                       html.match(/prompt\([^,]+,["']([a-zA-Z0-9+/=]+)["']\)/i) ||
                       html.match(/atob\(["']([a-zA-Z0-9+/=]+)["']\)/i);
        if (voeMatch) {
            console.log("[+] Patrón VOE detectado:");
            console.log(voeMatch.slice(0, 3));
        }

        // 4. Muestra de scripts inline si no encontró nada
        if (!directMatches && html.indexOf("eval(") === -1 && !voeMatch) {
            console.log("\n[!] Fragmento del HTML:");
            console.log(html.substring(0, 400));
        }
    })
    .catch(function(err) {
        console.error("[-] Error:", err.message);
    });
}

function runSequential(idx) {
    if (idx >= testUrls.length) {
        console.log("\n==================================================");
        console.log("[✓] AUDITORÍA COMPLETADA");
        console.log("==================================================");
        return;
    }
    inspect(testUrls[idx]).then(function() {
        runSequential(idx + 1);
    });
}

runSequential(0);
