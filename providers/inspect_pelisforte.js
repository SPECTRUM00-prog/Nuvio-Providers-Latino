/**
 * Diagnóstico del reproductor Byse para Coraline (q30e3tnwh7y2)
 * Ejecutar: node providers/inspect_pelisforte.js
 */

var https = require('https');
var CHUNK_URL = 'https://byseraguci.com/assets/videoPagesBundle-Bgi0QmPo.js';
var FILE_CODE = 'q30e3tnwh7y2'; // Coraline Latino
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, headers) {
    return new Promise(function(resolve, reject) {
        var p = new URL(url);
        https.get({
            hostname: p.hostname,
            path: p.pathname + p.search,
            headers: Object.assign({ 'User-Agent': USER_AGENT, 'Referer': 'https://byseraguci.com/e/' + FILE_CODE }, headers || {})
        }, function(res) {
            var c = [];
            res.on('data', function(d) { c.push(d); });
            res.on('end', function() { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c).toString('utf8') }); });
        }).on('error', reject);
    });
}

(async function() {
    console.log('>>> 1. DESCARGANDO /details DE CORALINE EN BYSE');
    var dRes = await get('https://byseraguci.com/api/videos/' + FILE_CODE + '/details');
    console.log('Status /details:', dRes.status);
    console.log('Body /details:', dRes.body);

    console.log('\n>>> 2. INSPECCIONANDO FUNCIÓN Et (PLAYBACK) EN EL BUNDLE DE BYSE');
    var chunk = await get(CHUNK_URL);
    var code = chunk.body;

    var etIdx = code.indexOf('Et=async');
    if (etIdx !== -1) {
        console.log('--- Código función Et (Playback) ---');
        console.log(code.slice(etIdx, etIdx + 1200).replace(/\s+/g, ' '));
    }

    var ntIdx = code.indexOf('nt=(');
    if (ntIdx === -1) ntIdx = code.indexOf('nt=function');
    if (ntIdx !== -1) {
        console.log('\n--- Función nt (construcción ruta) ---');
        console.log(code.slice(ntIdx, ntIdx + 400).replace(/\s+/g, ' '));
    }

    // Buscar también cualquier otra llamada a API en VideoEmbedPage
    var veIdx = code.indexOf('VideoEmbedPage');
    if (veIdx !== -1) {
        console.log('\n--- VideoEmbedPage declaración ---');
        console.log(code.slice(Math.max(0, veIdx - 400), veIdx + 200).replace(/\s+/g, ' '));
    }
})();
