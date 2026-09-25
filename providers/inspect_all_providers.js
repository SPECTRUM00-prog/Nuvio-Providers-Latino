/**
 * Diagnóstico Maestro de Conectividad y WAF para la Suite Nuvio
 * Ejecución: node providers/inspect_all_providers.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var targets = [
    {
        name: "CineCalidad (API LITE)",
        url: "https://tmdb.cinecalidad.am/v1/items/movie/872585",
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json", "Referer": "https://www.cinecalidad.am/" },
        validateJson: true
    },
    {
        name: "LaMovie (API LITE)",
        url: "https://tmdb2.cuevana3.gs/v1/items/movie/872585",
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json", "Referer": "https://lamovie.org/" },
        validateJson: true
    },
    {
        name: "SoloLatino (Embed69)",
        url: "https://embed69.org/f/tt0149460-1x01",
        headers: { "User-Agent": USER_AGENT, "Referer": "https://embed69.org/" },
        checkPoW: true
    },
    {
        name: "JKAnime (Buscador)",
        url: "https://jkanime.net/buscar/Mushoku%20Tensei/1/",
        headers: { "User-Agent": USER_AGENT, "Referer": "https://jkanime.net/" }
    },
    {
        name: "AniList (GraphQL)",
        url: "https://graphql.anilist.co",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ query: "{ Media(id: 1) { id } }" }),
        validateJson: true
    },
    {
        name: "AnimeAV1 (Home)",
        url: "https://animeav1.com",
        headers: { "User-Agent": USER_AGENT }
    },
    {
        name: "AnimeJara (Episodio)",
        url: "https://animejara.com/episode/jujutsu-kaisen-1x1/",
        headers: { "User-Agent": USER_AGENT, "Referer": "https://animejara.com/" }
    }
];

console.log("================================================================");
console.log("[*] AUDITORÍA GLOBAL DE PROVEEDORES (RED LIMPIA / PERSONAL)");
console.log("================================================================\n");

function probeTarget(idx) {
    if (idx >= targets.length) {
        console.log("\n================================================================");
        console.log("[✓] AUDITORÍA GLOBAL FINALIZADA");
        console.log("================================================================");
        return;
    }

    var item = targets[idx];
    console.log("----------------------------------------------------------------");
    console.log("[" + (idx + 1) + "/" + targets.length + "] " + item.name);
    console.log("    URL: " + item.url);

    var tStart = Date.now();
    var opts = {
        method: item.method || "GET",
        headers: item.headers,
        redirect: "follow"
    };
    if (item.body) opts.body = item.body;

    fetch(item.url, opts)
        .then(function(res) {
            var ms = Date.now() - tStart;
            var status = res.status;
            var server = res.headers.get("server") || "N/A";
            var cfRay = res.headers.get("cf-ray");
            var cfMitigated = res.headers.get("cf-mitigated");

            console.log("    -> Estado HTTP: " + status + " (" + res.statusText + ") en " + ms + " ms");
            console.log("    -> Servidor:    " + server);

            return res.text().then(function(body) {
                var isCfChallenge = (status === 403 || status === 503) && (
                    body.indexOf("challenge-platform") !== -1 ||
                    body.indexOf("Just a moment...") !== -1 ||
                    cfMitigated === "challenge"
                );

                if (isCfChallenge) {
                    console.log("    -> [!] RESULTADO: BLOQUEO WAF ACTIVO (Cloudflare Challenge)");
                } else if (status >= 200 && status < 300) {
                    console.log("    -> [✓] RESULTADO: ACCESIBLE (200 OK - " + body.length + " bytes)");

                    if (item.validateJson) {
                        try {
                            JSON.parse(body);
                            console.log("       ✓ Payload JSON parseado correctamente.");
                        } catch (e) {
                            console.log("       ✗ Error: No devolvió JSON válido.");
                        }
                    }

                    if (item.checkPoW) {
                        var hasPow = body.indexOf("POW_CHALLENGE") !== -1;
                        console.log("       " + (hasPow ? "✓ Parámetros PoW presentes en HTML." : "✗ Sin parámetros PoW."));
                    }
                } else {
                    console.log("    -> [?] RESULTADO: CÓDIGO INESPERADO (" + status + ")");
                }
            });
        })
        .catch(function(err) {
            var ms = Date.now() - tStart;
            console.log("    -> [✗] ERROR DE RED: " + err.message + " (" + ms + " ms)");
        })
        .then(function() {
            probeTarget(idx + 1);
        });
}

probeTarget(0);
