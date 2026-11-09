/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 14 - Chunk VideoPagesBundle de Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var CHUNK_URL = 'https://byseraguci.com/assets/videoPagesBundle-Bgi0QmPo.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url) {
    return new Promise(function(resolve, reject) {
        https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://byseraguci.com/'
            }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
        }).on('error', reject);
    });
}

function runAuditPhase14() {
    console.log('\n============================================================');
    console.log('>>> INSPECCIONANDO videoPagesBundle-Bgi0QmPo.js');
    console.log('============================================================');

    request(CHUNK_URL).then(function(code) {
        console.log('[TAMAÑO DEL CHUNK]: ' + code.length + ' bytes');

        // 1. Buscar todas las ocurrencias de operation: en este chunk
        var opMatches = code.match(/operation:\s*["']([a-zA-Z0-9_\/-]+)["']/g) || [];
        console.log('\n[OPERACIONES ENCONTRADAS EN VIDEO BUNDLE]:', opMatches);

        // 2. Buscar rutas /api/
        var apiMatches = code.match(/["']\/api\/[a-zA-Z0-9_\/-]+["']/g) || [];
        console.log('\n[RUTAS /api/ EN VIDEO BUNDLE]:', apiMatches);

        // 3. Buscar ocurrencias de VideoEmbedPage
        var embedIdx = code.indexOf('VideoEmbedPage');
        if (embedIdx !== -1) {
            console.log('\n[CONTEXTO DE VideoEmbedPage]:');
            console.log(code.substring(Math.max(0, embedIdx - 60), Math.min(code.length, embedIdx + 300)).replace(/\s+/g, ' '));
        }

        // 4. Buscar palabras clave de streaming (m3u8, hls, master, sources)
        var streamMatches = code.match(/["']([^"']*\.(?:m3u8|mp4)[^"']*)["']/gi) || [];
        console.log('\n[PATRONES DE STREAM EN VIDEO BUNDLE]:', streamMatches);

        // 5. Buscar llamadas a fetch en este chunk
        var fetchIdx = code.indexOf('fetch(');
        var fCount = 0;
        while (fetchIdx !== -1 && fCount < 3) {
            console.log('\n[FETCH #' + (fCount + 1) + ' EN VIDEO BUNDLE]:');
            console.log(code.substring(Math.max(0, fetchIdx - 40), Math.min(code.length, fetchIdx + 200)).replace(/\s+/g, ' '));
            fetchIdx = code.indexOf('fetch(', fetchIdx + 1);
            fCount++;
        }
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase14();
