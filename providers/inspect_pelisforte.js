/**
 * Volcado completo del flujo de reproducción en VideoEmbedPage (Zc)
 * Ejecutar: node providers/inspect_pelisforte.js
 */

var https = require('https');
var CHUNK_URL = 'https://byseraguci.com/assets/videoPagesBundle-Bgi0QmPo.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url) {
    return new Promise(function(resolve, reject) {
        https.get(url, { headers: { 'User-Agent': USER_AGENT } }, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() { resolve(Buffer.concat(c).toString('utf8')); });
        }).on('error', reject);
    });
}

(async function() {
    var code = await get(CHUNK_URL);

    var zcIdx = code.indexOf('Zc=()=>');
    if (zcIdx === -1) zcIdx = code.indexOf('Zc=');

    console.log('=== FLUJO DE CARGA EN VideoEmbedPage (Zc) ===');
    var zcBody = code.slice(zcIdx, zcIdx + 3500);
    // Mostrar fragmentos formateados
    console.log(zcBody.replace(/\s+/g, ' '));

    // Buscar llamadas a Et, en o APIs dentro de Zc
    console.log('\n=== LLAMADAS A FUNCIONES DENTRO DE Zc ===');
    var calls = zcBody.match(/(?:await\s+|then\s*\(\s*)(?:Et|en|si|oi|ct|hr|[a-zA-Z0-9_$]+)\s*\([^)]*\)/g) || [];
    console.log(calls.slice(0, 10));
})();
