/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 10 - Reverse Final de Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BYSE_BUNDLE_URL = 'https://byseraguci.com/assets/index-DocunfmE.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://byseraguci.com/'
            },
            timeout: 8000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase10() {
    console.log('\n============================================================');
    console.log('>>> INSPECCIONANDO LLAMADAS Y ENLACES EN EL JS DE BYSE');
    console.log('============================================================');

    request(BYSE_BUNDLE_URL).then(function(code) {
        // 1. Buscar extensiones de video m3u8 / mp4
        var videoTerms = code.match(/["']([^"']*\.(?:m3u8|mp4|webm)[^"']*)["']/gi) || [];
        console.log('Menciones de video detectadas:', videoTerms.slice(0, 10));

        // 2. Buscar cómo obtiene los datos del archivo en el embed
        var fileKeywords = ['file_code', 'filecode', 'get_file', 'player_data', 'stream_url', 'download_url', 'sources:'];
        fileKeywords.forEach(function(kw) {
            var idx = code.indexOf(kw);
            if (idx !== -1) {
                console.log('\n[KEYWORD: ' + kw + ']:');
                console.log(code.substring(Math.max(0, idx - 50), Math.min(code.length, idx + 150)).replace(/\s+/g, ' '));
            }
        });

        // 3. Buscar llamadas de red (fetch, xhr, post)
        var networkKeywords = ['fetch(', 'axios(', 'XMLHttpRequest', 'ajax('];
        networkKeywords.forEach(function(nk) {
            var idx = 0;
            var count = 0;
            while ((idx = code.indexOf(nk, idx)) !== -1 && count < 3) {
                console.log('\n[NETWORK CALL: ' + nk + ']:');
                console.log(code.substring(Math.max(0, idx - 40), Math.min(code.length, idx + 180)).replace(/\s+/g, ' '));
                idx += nk.length;
                count++;
            }
        });
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase10();
