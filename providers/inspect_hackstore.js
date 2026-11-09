/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 7 - Contexto de /episodes y Tabs)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var urlModule = require('url');

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getFile(url) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(url);
        https.get({
            hostname: parsed.hostname,
            path: parsed.path,
            headers: { 'User-Agent': USER_AGENT }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
        }).on('error', reject);
    });
}

function runPhase7() {
    console.log('\n============================================================');
    console.log('>>> 1. INSPECCIONANDO CONTEXTO DE /episodes EN Episodes-2cb1c73a.js');
    console.log('============================================================');

    var epBundleUrl = 'https://hackstore2.com/wp-content/themes/hackstore/assets/build/assets/Episodes-2cb1c73a.js';
    var mainBundleUrl = 'https://hackstore2.com/wp-content/themes/hackstore/assets/build/assets/index-8f03e130.js';

    getFile(epBundleUrl).then(function(code) {
        var idx = code.indexOf('/episodes');
        while (idx !== -1) {
            var snippet = code.substring(Math.max(0, idx - 120), Math.min(code.length, idx + 200));
            console.log('Fragmento /episodes:');
            console.log('  ' + snippet.replace(/\s+/g, ' ') + '\n');
            idx = code.indexOf('/episodes', idx + 1);
        }

        console.log('============================================================');
        console.log('>>> 2. INSPECCIONANDO TABS DE BÚSQUEDA EN index-8f03e130.js');
        console.log('============================================================');

        return getFile(mainBundleUrl).then(function(mainCode) {
            var movieIdx = mainCode.indexOf('useState("movies")');
            if (movieIdx !== -1) {
                var snippetMain = mainCode.substring(movieIdx, Math.min(mainCode.length, movieIdx + 350));
                console.log('Fragmento Tabs en Buscador:');
                console.log('  ' + snippetMain.replace(/\s+/g, ' ') + '\n');
            }

            // Buscar ocurrencias de series en el bundle principal
            var seriesTerms = mainCode.match(/["']([a-zA-Z0-9_-]*(?:serie|episode|temporada|season)[a-zA-Z0-9_-]*)["']/gi);
            if (seriesTerms) {
                var uniqueTerms = [];
                seriesTerms.forEach(function(t) {
                    if (uniqueTerms.indexOf(t) === -1 && t.length < 25) uniqueTerms.push(t);
                });
                console.log('Términos relacionados con series detectados en el bundle:', uniqueTerms.slice(0, 15));
            }
        });
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runPhase7();
