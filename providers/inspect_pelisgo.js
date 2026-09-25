/**
 * Script de auditoría para PelisGO (pelisgo.online)
 * Ejecución: node providers/inspect_pelisgo.js
 */

var BASE_URL = "https://pelisgo.online";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": BASE_URL + "/"
};

console.log("==================================================");
console.log("[*] AUDITORÍA DE CONECTIVIDAD Y WAF: PelisGO");
console.log("    URL objetivo: " + BASE_URL);
console.log("==================================================\n");

console.log("[1] Conectando a la portada...");

fetch(BASE_URL, { headers: headers, redirect: "follow" })
    .then(function(res) {
        var status = res.status;
        var server = res.headers.get("server") || "Desconocido";
        var cfRay = res.headers.get("cf-ray");
        var cfMitigated = res.headers.get("cf-mitigated");

        console.log("-> Estado HTTP: " + status + " (" + res.statusText + ")");
        console.log("-> Servidor:    " + server);
        console.log("-> CF-Ray:      " + (cfRay ? cfRay : "No presente"));
        console.log("-> CF-Mitigated:" + (cfMitigated ? cfMitigated : "No"));

        return res.text().then(function(body) {
            console.log("-> Tamaño recibido: " + body.length + " caracteres.");

            var isCfChallenge = (status === 403 || status === 503) && (
                body.indexOf("challenge-platform") !== -1 ||
                body.indexOf("Just a moment...") !== -1 ||
                cfMitigated === "challenge"
            );

            if (isCfChallenge) {
                console.log("\n[!] RESULTADO: BLOQUEO ACTIVO DE CLOUDFLARE (Challenge)");
                console.log("    El sitio requiere interacción gráfica de navegador.");
                console.log("    -> Incompatible con el runtime ligero de Hermes.");
                return;
            }

            if (status >= 200 && status < 300) {
                console.log("\n[+] RESULTADO: ACCESIBLE (200 OK)");

                // 2. Analizar si es una SPA (Single Page Application)
                var isSpa = body.indexOf('id="root"') !== -1 || 
                            body.indexOf('id="app"') !== -1 || 
                            body.indexOf('id="__next"') !== -1;

                if (isSpa) {
                    console.log("[i] Tipo detectado: SPA (Single Page Application / React / Vue / Next)");
                } else if (body.indexOf("wp-content") !== -1 || body.indexOf("wp-json") !== -1) {
                    console.log("[i] Tipo detectado: WordPress (Dooplay / Toroplay / Custom)");
                } else {
                    console.log("[i] Tipo detectado: HTML estándar");
                }

                // 3. Extraer scripts JS principales
                var scripts = [];
                var sRegex = /<script[^>]+src=["']([^"']+)["']/gi;
                var sm;
                while ((sm = sRegex.exec(body)) !== null) {
                    scripts.push(sm[1]);
                }
                console.log("\n[+] Scripts JS encontrados en portada (" + scripts.length + "):");
                console.log(scripts.slice(0, 8));

                // 4. Buscar posibles rutas de API en el HTML
                var apiMatches = body.match(/["'](\/(?:api|v[0-9]|wp-json|search|buscar)[^"'\s<>]*)["']/gi) || [];
                var uniqueApis = [];
                for (var a = 0; a < apiMatches.length; a++) {
                    var cleanApi = apiMatches[a].replace(/["']/g, "");
                    if (uniqueApis.indexOf(cleanApi) === -1) uniqueApis.push(cleanApi);
                }
                console.log("\n[+] Posibles rutas de API o búsqueda detectadas:");
                console.log(uniqueApis.slice(0, 15));

                // 5. Muestra de los primeros 300 caracteres del HTML
                console.log("\n--- Primeros 300 caracteres del HTML ---");
                console.log(body.substring(0, 300));
                console.log("----------------------------------------");
            } else {
                console.log("\n[?] Código inesperado (" + status + ").");
            }
        });
    })
    .catch(function(err) {
        console.error("\n[-] Error de conexión:", err.message);
    });
