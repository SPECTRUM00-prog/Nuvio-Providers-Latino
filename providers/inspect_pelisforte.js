/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 11 - Función Gv y Endpoint Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var BYSE_BUNDLE_URL = 'https://byseraguci.com/assets/index-DocunfmE.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url) {
    return new Promise(function(resolve, reject) {
        https.get(url, { headers: { 'User-Agent': USER_AGENT } }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
        }).on('error', reject);
    });
}

function runAuditPhase11() {
    console.log('\n============================================================');
    console.log('>>> BUSCANDO LA DEFINICIÓN DE Gv Y OPERACIONES EN BYSE');
    console.log('============================================================');

    request(BYSE_BUNDLE_URL).then(function(code) {
        // Buscar "Gv=" o "function Gv"
        var idx = code.indexOf('Gv=');
        if (idx === -1) idx = code.indexOf('function Gv');

        if (idx !== -1) {
            console.log('[DEFINICIÓN DE Gv ENCONTRADA]:');
            console.log(code.substring(Math.max(0, idx - 40), Math.min(code.length, idx + 350)).replace(/\s+/g, ' '));
        }

        // Buscar operaciones comunes en el código (play, file, stream, embed)
        var opMatches = code.match(/operation:\s*["']([^"']+)["']/g) || [];
        console.log('\n[OPERACIONES DETECTADAS]:', opMatches);

        // Buscar URLs base en el bundle
        var baseUrls = code.match(/https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}(?:\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]*)?/g) || [];
        var uniqueBases = [];
        baseUrls.forEach(function(u) {
            if (uniqueBases.indexOf(u) === -1 && u.indexOf('w3.org') === -1 && u.indexOf('cloudflare') === -1) {
                uniqueBases.push(u);
            }
        });
        console.log('\n[URLS BASE / DOMINIOS EN EL JS]:', uniqueBases.slice(0, 10));
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase11();
