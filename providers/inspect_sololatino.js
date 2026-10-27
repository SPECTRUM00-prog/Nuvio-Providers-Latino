/**
 * Auditoría paso a paso de SoloLatino (embed69)
 * Ejecución: node providers/inspect_sololatino.js 533535 movie
 */

var tmdbId = process.argv[2] || "533535";
var mediaType = process.argv[3] || "movie";

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var BASE_URL = "https://embed69.org";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

console.log("=================================================================");
console.log(">>> PASO 1: CONSULTANDO TMDB PARA OBTENER IMDB ID <<<");
console.log("=================================================================");

var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=es-MX&append_to_response=external_ids";

fetch(tmdbUrl)
.then(function(r) { return r.json(); })
.then(function(meta) {
    var imdbId = (meta.external_ids && meta.external_ids.imdb_id) || meta.imdb_id;
    console.log("[+] Título:", meta.title || meta.name);
    console.log("[+] IMDb ID obtenido:", imdbId);

    if (!imdbId) {
        console.log("[-] TMDB no tiene IMDb ID para este título.");
        return;
    }

    var targetUrl = BASE_URL + "/f/" + imdbId;
    console.log("\n=================================================================");
    console.log(">>> PASO 2: DESCARGANDO PÁGINA EN EMBED69 <<<");
    console.log("=================================================================");
    console.log("URL:", targetUrl);

    return fetch(targetUrl, {
        headers: {
            "User-Agent": USER_AGENT,
            "Referer": BASE_URL + "/"
        }
    })
    .then(function(res) {
        console.log("-> Status HTTP:", res.status, res.statusText);
        console.log("-> Server:", res.headers.get("server"));
        return res.text();
    })
    .then(function(html) {
        console.log("-> Tamaño HTML recibido:", html.length, "bytes");

        if (html.length < 500) {
            console.log("-> Respuesta muy corta:", html);
            return;
        }

        console.log("\n=================================================================");
        console.log(">>> PASO 3: DETECCIÓN DE RETO CRIPTOGRÁFICO (PoW + AES) <<<");
        console.log("=================================================================");

        var challengeMatch = html.match(/(?:const|let|var)\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/i);
        var difficultyMatch = html.match(/(?:const|let|var)\s+POW_DIFFICULTY\s*=\s*(\d+)/i);
        var saltMatch = html.match(/(?:const|let|var)\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/i);
        var dataLinkMatch = html.match(/(?:let|var|const)\s+dataLink\s*=\s*(\[[\s\S]*?\])\s*;/i);

        console.log("[PoW Challenge]:", challengeMatch ? challengeMatch[1].substring(0, 30) + "... (longitud: " + challengeMatch[1].length + ")" : "¡NO ENCONTRADO!");
        console.log("[PoW Dificultad]:", difficultyMatch ? difficultyMatch[1] : "¡NO ENCONTRADA!");
        console.log("[PoW Salt]:", saltMatch ? saltMatch[1] : "Ninguno / Vacío");
        console.log("[dataLink Encriptado]:", dataLinkMatch ? "Encontrado (" + dataLinkMatch[1].length + " bytes)" : "¡NO ENCONTRADO!");

        if (!dataLinkMatch) {
            console.log("\n[-] No se encontró 'dataLink'. Primeros 500 caracteres del HTML:");
            console.log(html.substring(0, 500).replace(/\r?\n\s*/g, " "));
        }
    });
})
.catch(function(err) {
    console.error("[-] ERROR DE RED O CONEXIÓN:", err.message);
});
