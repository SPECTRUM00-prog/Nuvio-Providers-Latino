/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 13 - Chunks y DOM de Byse Embed)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var BYSE_EMBED_URL = 'https://byseraguci.com/e/tiumae2gw611/P4N0RM-18LA.mp4';
var BYSE_MAIN_BUNDLE = 'https://byseraguci.com/assets/index-DocunfmE.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url) {
    return new Promise(function(resolve, reject) {
        https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://mp4.nu/'
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

function runAuditPhase13() {
    console.log('\n============================================================');
    console.log('>>> 1. VOLCANDO EL HTML COMPLETO DE BYSE EMBED (/e/...)');
    console.log('============================================================');

    return request(BYSE_EMBED_URL).then(function(html) {
        console.log('[HTML COMPLETO]:');
        console.log(html);

        console.log('\n============================================================');
        console.log('>>> 2. BUSCANDO CHUNKS DINÁMICOS (.js) EN EL BUNDLE PRINCIPAL');
        console.log('============================================================');

        return request(BYSE_MAIN_BUNDLE).then(function(code) {
            // Buscar importaciones de chunks tipo /assets/*.js
            var chunkMatches = code.match(/["'](?:\/assets\/|\.\/)[a-zA-Z0-9_-]+\.js["']/g) || [];
            console.log('[CHUNKS ENCONTRADOS]:', chunkMatches);

            // Buscar palabras clave de reproductor de video
            var playerMatches = code.match(/["'](?:video|player|hls|m3u8|blob)[a-zA-Z0-9_\/-]*["']/gi) || [];
            var uniquePlayers = [];
            playerMatches.forEach(function(p) {
                if (uniquePlayers.indexOf(p) === -1 && p.length < 30) uniquePlayers.push(p);
            });
            console.log('\n[TÉRMINOS DE REPRODUCTOR EN JS]:', uniquePlayers.slice(0, 15));
        });
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase13();
