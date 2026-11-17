/**
 * Ver la definición de nt() y VideoEmbedPage (Zc) en Byse
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

    // 1. Buscar dónde se define nt antes de Et
    var etIdx = code.indexOf('Et=async');
    if (etIdx !== -1) {
        // Buscar hacia atrás la asignación de nt =
        var subBefore = code.slice(Math.max(0, etIdx - 1500), etIdx);
        console.log('=== CÓDIGO JUSTO ANTES DE Et (Definición de nt / dt / wt) ===');
        var ntMatches = subBefore.match(/(?:const|let|var|function)\s+nt\b[\s\S]{1,250}/g) || [];
        if (ntMatches.length > 0) {
            ntMatches.forEach(function(m) { console.log(m.replace(/\s+/g, ' ')); });
        } else {
            // Mostrar últimos 600 caracteres antes de Et
            console.log(subBefore.slice(-600).replace(/\s+/g, ' '));
        }
    }

    // 2. Buscar VideoEmbedPage (Zc)
    var zcIdx = code.indexOf('Zc=');
    if (zcIdx === -1) zcIdx = code.indexOf('function Zc');
    if (zcIdx !== -1) {
        console.log('\n=== COMPONENTE VideoEmbedPage (Zc) ===');
        console.log(code.slice(zcIdx, zcIdx + 1200).replace(/\s+/g, ' '));
    }
})();
