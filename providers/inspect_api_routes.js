/**
 * Mapeo de rutas de fastApi y wpf/v1 para Cinecalidad y LaMovie
 * Ejecución: node providers/inspect_api_routes.js "deadpool" 533535
 */

var query = process.argv[2] || "deadpool";
var tmdbId = process.argv[3] || "533535";

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var headers = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://lamovie.org/"
};

function testEndpoint(name, url) {
    return fetch(url, { headers: headers })
        .then(function(res) {
            return res.text().then(function(text) {
                var isJson = false;
                var preview = text.substring(0, 250).replace(/\r?\n\s*/g, " ");
                try {
                    JSON.parse(text);
                    isJson = true;
                } catch(e) {}

                console.log("[" + res.status + "] " + name + " -> " + url);
                if (isJson) {
                    console.log("    [+] ¡JSON VÁLIDO! Muestra: " + preview + "...\n");
                } else if (res.status === 200) {
                    console.log("    [i] 200 OK pero no JSON: " + preview.substring(0, 100) + "...\n");
                }
                return { status: res.status, isJson: isJson, text: text };
            });
        })
        .catch(function(err) {
            console.log("[-] Error en " + name + ": " + err.message);
            return null;
        });
}

console.log("=================================================================");
console.log(">>> AUDITANDO RUTAS CANDIDATAS DE LA NUEVA API <<<");
console.log("=================================================================\n");

// 1. Probar el índice general de la API wpf/v1 de LaMovie
testEndpoint("LaMovie WPF Index", "https://lamovie.org/wp-json/wpf/v1")
.then(function() {
    // 2. Probar rutas comunes de búsqueda en wpf/v1
    return testEndpoint("LaMovie WPF Search", "https://lamovie.org/wp-json/wpf/v1/search?keyword=" + encodeURIComponent(query));
})
.then(function() {
    return testEndpoint("LaMovie WPF Search (q)", "https://lamovie.org/wp-json/wpf/v1/search?q=" + encodeURIComponent(query));
})
.then(function() {
    // 3. Probar fastApi
    return testEndpoint("LaMovie FastApi Search", "https://lamovie.org/wp-api/v1/search?keyword=" + encodeURIComponent(query));
})
.then(function() {
    return testEndpoint("LaMovie FastApi Search (q)", "https://lamovie.org/wp-api/v1/search?q=" + encodeURIComponent(query));
})
.then(function() {
    // 4. Probar si soportan consulta por tmdbId directo
    return testEndpoint("LaMovie TMDB Direct", "https://lamovie.org/wp-json/wpf/v1/movie/" + tmdbId);
})
.then(function() {
    return testEndpoint("LaMovie FastApi TMDB", "https://lamovie.org/wp-api/v1/movie/" + tmdbId);
})
.then(function() {
    // 5. Probar Cinecalidad
    return testEndpoint("Cinecalidad FastApi Search", "https://cinecalidad.org/wp-api/v1/search?keyword=" + encodeURIComponent(query));
})
.then(function() {
    return testEndpoint("Cinecalidad WPF Search", "https://cinecalidad.org/wp-json/wpf/v1/search?keyword=" + encodeURIComponent(query));
})
.then(function() {
    console.log("=================================================================");
    console.log(">>> AUDITORÍA DE ENDPOINTS COMPLETADA <<<");
    console.log("=================================================================");
});
