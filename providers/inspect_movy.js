/**
 * Script de inspección para Movy (movy.sx)
 * Ejecución: node providers/inspect_movy.js 106617 tv 1 1
 */

var tmdbId = process.argv[2] || "106617"; // Heroes (2020)
var mediaType = process.argv[3] || "tv";
var season = process.argv[4] || "1";
var episode = process.argv[5] || "1";

var BASE_URL = "https://www.movy.sx";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("=================================================================");
console.log(">>> AUDITANDO MOVY (TMDB: " + tmdbId + " | " + mediaType + " S" + season + "E" + episode + ") <<<");
console.log("=================================================================\n");

var pageUrl = BASE_URL + "/" + mediaType + "/" + tmdbId + "?play=true";
console.log("[1] Descargando página oficial:", pageUrl);

fetch(pageUrl, { headers: headers })
.then(function(res) {
    console.log("-> Status HTTP:", res.status, res.statusText);
    console.log("-> Servidor:", res.headers.get("server"));
    return res.text();
})
.then(function(html) {
    console.log("-> Tamaño HTML:", html.length, "bytes");

    // 1. Buscar iframes o embed providers
    var iframes = [];
    var ifRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    var im;
    while ((im = ifRegex.exec(html)) !== null) {
        iframes.push(im[1]);
    }
    console.log("\n[+] Iframes encontrados (" + iframes.length + "):", iframes);

    // 2. Buscar enlaces de video directos m3u8 o mp4
    var m3u8 = html.match(/https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>]*/gi) || [];
    console.log("[+] Streams m3u8 directos en HTML (" + m3u8.length + "):", m3u8);

    // 3. Buscar llamadas a APIs internas o scripts de datos
    var apiCalls = html.match(/https?:\/\/[a-zA-Z0-9.-]*(?:api|source|player|vidy|wecollege)[^"'\s<>]+/gi) || [];
    var uniqueApis = [];
    for (var a = 0; a < apiCalls.length; a++) {
        var cleanApi = apiCalls[a].replace(/\\/g, "");
        if (uniqueApis.indexOf(cleanApi) === -1) uniqueApis.push(cleanApi);
    }
    console.log("\n[+] Endpoints / APIs detectadas (" + uniqueApis.length + "):");
    console.log(uniqueApis.slice(0, 8));

    // 4. Buscar datos JSON hidratados de Next.js (__NEXT_DATA__)
    var nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
        try {
            var nextData = JSON.parse(nextDataMatch[1]);
            console.log("\n[+] __NEXT_DATA__ detectado con éxito:");
            console.log("    Página:", nextData.page);
            console.log("    BuildId:", nextData.buildId);
            if (nextData.props && nextData.props.pageProps) {
                console.log("    Claves de pageProps:", Object.keys(nextData.props.pageProps));
            }
        } catch (e) {
            console.log("[-] __NEXT_DATA__ no se pudo parsear como JSON.");
        }
    }
})
.catch(function(err) {
    console.error("[-] ERROR:", err.message);
});
