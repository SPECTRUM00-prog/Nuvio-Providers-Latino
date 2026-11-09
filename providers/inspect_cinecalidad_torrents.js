/**
 * Inspección de enlaces Torrent en Cinecalidad
 * Ejecución: node providers/inspect_cinecalidad_torrents.js
 */

var TARGET_URL = "https://www.cinecalidad.am/ver-pelicula/coraline-y-la-puerta-secreta-online-gratis-en-cinecalidad/";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": "https://www.cinecalidad.am/"
};

console.log("=================================================================");
console.log(">>> AUDITANDO ENLACES TORRENT EN CINECALIDAD <<<");
console.log("=================================================================");
console.log("URL:", TARGET_URL);

fetch(TARGET_URL, { headers: headers })
.then(function(res) {
    console.log("-> Status HTTP:", res.status);
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length, "bytes\n");

    // 1. Buscar todos los enlaces que contengan 'utorrent', 'torrent' o 'magnet'
    var torrentLinks = [];
    var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;

    while ((m = regex.exec(html)) !== null) {
        var href = m[1];
        var text = m[2].replace(/<[^>]+>/g, "").trim();

        if (text.toLowerCase().indexOf("utorrent") !== -1 || 
            href.indexOf("torrent") !== -1 || 
            href.indexOf("magnet:") !== -1) {
            torrentLinks.push({ label: text, url: href });
        }
    }

    console.log("[+] Enlaces uTorrent detectados en el HTML (" + torrentLinks.length + "):");
    for (var i = 0; i < torrentLinks.length; i++) {
        console.log("   [" + (i + 1) + "] " + torrentLinks[i].label + " -> " + torrentLinks[i].url);
    }

    if (torrentLinks.length === 0) {
        console.log("[-] No se detectaron con el filtro. Buscando sección 'DESCARGAR'...");
        var secMatch = html.match(/DESCARGAR[\s\S]{1,1500}?<\/div>/i);
        if (secMatch) console.log(secMatch[0]);
        return;
    }

    // 2. Probar a consultar el primer enlace para ver a dónde redirige o qué entrega
    var firstTorrent = torrentLinks[0];
    console.log("\n=================================================================");
    console.log(">>> PROBANDO RESOLVER DEL PRIMER TORRENT: [" + firstTorrent.label + "] <<<");
    console.log("=================================================================");
    console.log("Consultando:", firstTorrent.url);

    if (firstTorrent.url.indexOf("magnet:") === 0) {
        console.log("[+] ¡ES UN ENLACE MAGNET DIRECTO!: \n" + firstTorrent.url);
        return;
    }

    return fetch(firstTorrent.url, {
        headers: headers,
        redirect: "follow"
    })
    .then(function(tRes) {
        console.log("-> Status HTTP de la descarga:", tRes.status);
        console.log("-> URL final tras redirección:", tRes.url);
        return tRes.text();
    })
    .then(function(tHtml) {
        // Buscar si la página destino contiene el magnet real
        var magnetMatch = tHtml.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/i);
        if (magnetMatch) {
            console.log("[+] ¡MAGNET EXTRAÍDO CON ÉXITO!:\n" + magnetMatch[0]);
        } else {
            console.log("[-] Muestra de la respuesta destino (primeros 200 caracteres):");
            console.log(tHtml.substring(0, 200).replace(/\r?\n\s*/g, " "));
        }
    });
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
