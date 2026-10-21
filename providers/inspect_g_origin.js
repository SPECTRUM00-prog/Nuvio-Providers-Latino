/**
 * Rastrear cómo se obtiene 'g' (g.data.embeds) en app.js
 * Ejecución: node providers/inspect_g_origin.js
 */

var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var appJsUrl = "https://lamovie.org/wp-content/themes/lamovie/assets/build/static/assets/app.js?v=1787967824";

console.log("=================================================================");
console.log(">>> RASTREANDO LA DEFINICIÓN DE 'g' EN APP.JS <<<");
console.log("=================================================================");

fetch(appJsUrl, { headers: { "User-Agent": USER_AGENT } })
.then(function(res) { return res.text(); })
.then(function(code) {
    var pos = 875186;
    // Miramos los 2000 caracteres justo antes de la invocación
    var start = Math.max(0, pos - 2000);
    console.log("Código donde se inicializa y carga 'g':\n");
    console.log(code.substring(start, pos).replace(/\r?\n\s*/g, " "));
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
