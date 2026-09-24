/**
 * Script para descubrir la API y el formulario de búsqueda de CineCalidad LITE
 */

var BASE_URL = "https://www.cinecalidad.am";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var headers = {
    "User-Agent": USER_AGENT,
    "Referer": BASE_URL + "/"
};

console.log("[*] 1. Descargando portada para inspeccionar el buscador...");

fetch(BASE_URL, { headers: headers })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        console.log("-> Portada descargada. Tamaño:", html.length, "caracteres.");

        // Buscar formularios de búsqueda
        var formMatch = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi);
        if (formMatch) {
            console.log("\n[+] Formularios detectados en la web:");
            for (var i = 0; i < formMatch.length; i++) {
                console.log(formMatch[i]);
            }
        } else {
            console.log("\n[-] No se encontraron etiquetas <form> tradicionales.");
        }

        // Buscar scripts que manejen la búsqueda o APIs
        console.log("\n[+] Buscando rutas de API o scripts de búsqueda:");
        var apiMatches = html.match(/(?:action|api|search|endpoint|url)\s*[:=]\s*["']([^"']*(?:search|buscar|api)[^"']*)["']/gi);
        if (apiMatches) {
            console.log(apiMatches);
        } else {
            console.log("No hay rutas explícitas en HTML.");
        }

        // Buscar scripts JS incluidos
        var scripts = [];
        var sRegex = /<script[^>]+src=["']([^"']+)["']/gi;
        var sm;
        while ((sm = sRegex.exec(html)) !== null) {
            scripts.push(sm[1]);
        }
        console.log("\n[+] Scripts JS cargados en la portada (" + scripts.length + "):");
        console.log(scripts.slice(0, 10));
    })
    .then(function() {
        console.log("\n[*] 2. Inspeccionando los 1,913 caracteres de `/?s=Breaking%20Bad`:");
        return fetch(BASE_URL + "/?s=Breaking%20Bad", { headers: headers });
    })
    .then(function(res) { return res.text(); })
    .then(function(body) {
        console.log("--- CONTENIDO COMPLETO DE LA RESPUESTA ---");
        console.log(body);
        console.log("------------------------------------------");
    })
    .catch(function(err) {
        console.error("Error:", err.message);
    });
