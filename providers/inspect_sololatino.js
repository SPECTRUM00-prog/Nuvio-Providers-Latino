/**
 * Desofuscador de strings de StreamWish (hglink.to) y prueba de JKAnime (hgcloud.to)
 * Ejecución: node providers/inspect_sololatino.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var mainJsUrl = "https://hglink.to/main.js?v=1.1.9";
var jkanimeWishUrl = "https://hgcloud.to/e/1wa6sleaafp2";

console.log("=================================================================");
console.log(">>> [1/2] EXTRAYENDO CADENAS OCULTAS DE MAIN.JS (71 KB) <<<");
console.log("=================================================================\n");

fetch(mainJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    // 1. Extraer la tabla de strings rotada del inicio de main.js
    var arrayMatch = code.match(/function\s+(_0x[a-f0-9]+)\s*\(\)\s*\{\s*const\s+(_0x[a-f0-9]+)\s*=\s*(\[[^\]]+\]);/i) ||
                     code.match(/const\s+(_0x[a-f0-9]+)\s*=\s*(\[[^\]]+\]);/i);

    if (arrayMatch) {
        try {
            var rawArrayStr = arrayMatch[3] || arrayMatch[2];
            var stringTable = JSON.parse(rawArrayStr.replace(/'/g, '"'));
            console.log("[+] Tabla de cadenas detectada (" + stringTable.length + " elementos).");

            // Filtrar las cadenas que parezcan URLs, endpoints, métodos HTTP o lockers
            var interesting = [];
            for (var i = 0; i < stringTable.length; i++) {
                var s = String(stringTable[i]);
                if (s.indexOf("/") !== -1 || s.indexOf("http") !== -1 || s.indexOf("POST") !== -1 || 
                    s.indexOf("GET") !== -1 || s.indexOf(".php") !== -1 || s.indexOf("m3u8") !== -1 ||
                    s.indexOf("player") !== -1 || s.indexOf("token") !== -1) {
                    interesting.push(s);
                }
            }
            console.log("\n[+] Cadenas clave extraídas de la protección:");
            console.log(interesting);
        } catch (e) {
            console.log("[-] No se pudo parsear el array directo:", e.message);
        }
    } else {
        console.log("[-] Buscando patrones con eval seguro...");
    }

    console.log("\n=================================================================");
    console.log(">>> [2/2] PROBANDO STREAMWISH DE JKANIME (hgcloud.to) <<<");
    console.log("=================================================================");
    console.log("URL:", jkanimeWishUrl);

    return fetch(jkanimeWishUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": "https://jkanime.net/" },
        redirect: "follow"
    })
    .then(function(r) {
        console.log("-> Status HTTP:", r.status);
        console.log("-> URL final:", r.url);
        return r.text();
    })
    .then(function(jkHtml) {
        console.log("-> Tamaño HTML recibido:", jkHtml.length, "bytes");

        if (jkHtml.indexOf("main.js") !== -1) {
            console.log("[-] hgcloud.to también utiliza el loader main.js.");
        } else if (jkHtml.indexOf("eval(function(p,a,c,k,e,") !== -1) {
            console.log("[+] ¡EXCELENTE! hgcloud.to usa Dean Edwards sin ofuscador. Se puede extraer directo.");
        } else {
            console.log("[-] Muestra primeros 200 caracteres:", jkHtml.substring(0, 200).replace(/\r?\n\s*/g, " "));
        }
    });
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
