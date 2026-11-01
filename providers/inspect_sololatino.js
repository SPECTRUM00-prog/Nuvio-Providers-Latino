/**
 * Auditoría de "Principal" (player.peliserieshoy.com) para SoloLatino
 * Ejecución: node providers/inspect_sololatino.js
 */

var IMDB_ID = "tt0327597"; // Coraline
var TARGET_URL = "https://player.peliserieshoy.com/" + IMDB_ID;
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": "https://sololatino.net/",
    "Origin": "https://sololatino.net"
};

console.log("=================================================================");
console.log(">>> AUDITANDO BOTÓN 'PRINCIPAL': " + TARGET_URL + " <<<");
console.log("=================================================================\n");

fetch(TARGET_URL, { headers: headers })
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length, "bytes");

    // 1. Buscar enlaces m3u8 o mp4 en el HTML
    var m3u8 = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/gi) || [];
    var mp4 = html.match(/https?:\/\/[^"'\s<>\\]+\.mp4[^"'\s<>]*/gi) || [];
    console.log("\n[+] Streams M3U8 encontrados (" + m3u8.length + "):", m3u8);
    console.log("[+] Streams MP4 encontrados (" + mp4.length + "):", mp4);

    // 2. Buscar cómo llama a s.php (parámetros que envía)
    var sPhpMatch = html.match(/(?:fetch|ajax|\$\.post)\s*\([^)]*s\.php[^)]*\)/gi) ||
                    html.match(/["']s\.php["'][^;]+/gi);
    if (sPhpMatch) {
        console.log("\n[+] Llamada a s.php detectada:");
        console.log(sPhpMatch[0].substring(0, 300));
    }

    // 3. Buscar variables de video o servidores (sources, servers, file)
    var sourcesMatch = html.match(/(?:sources|file|video)\s*[:=]\s*([\[\{][\s\S]*?[\]\}])/gi);
    if (sourcesMatch) {
        console.log("\n[+] Fuentes de video detectadas en scripts (" + sourcesMatch.length + "):");
        for (var i = 0; i < Math.min(3, sourcesMatch.length); i++) {
            console.log("    [" + (i + 1) + "] " + sourcesMatch[i].substring(0, 250) + "...\n");
        }
    }

    // 4. Probar consulta directa a s.php con el IMDb ID
    console.log("=================================================================");
    console.log(">>> PROBANDO ENDPOINT BACKEND: https://player.peliserieshoy.com/s.php <<<");
    console.log("=================================================================");

    return fetch("https://player.peliserieshoy.com/s.php", {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": TARGET_URL,
            "Origin": "https://player.peliserieshoy.com",
            "X-Requested-With": "XMLHttpRequest"
        },
        body: "id=" + IMDB_ID
    })
    .then(function(sRes) {
        console.log("-> s.php Status HTTP:", sRes.status);
        return sRes.text();
    })
    .then(function(sText) {
        console.log("-> Respuesta de s.php:");
        console.log(sText.substring(0, 500));
    });
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
