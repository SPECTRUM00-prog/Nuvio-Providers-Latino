/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 12 - Operaciones API de Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var BYSE_BUNDLE_URL = 'https://byseraguci.com/assets/index-DocunfmE.js';
var FILE_CODE = 'tiumae2gw611';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url, options) {
    options = options || {};
    return new Promise(function(resolve, reject) {
        var parsed = new URL(url);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: options.method || 'GET',
            headers: Object.assign({
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://byseraguci.com/e/' + FILE_CODE
            }, options.headers || {}),
            timeout: 6000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase12() {
    console.log('\n============================================================');
    console.log('>>> 1. BUSCANDO TODAS LAS OCURRENCIAS DE operation: EN EL JS');
    console.log('============================================================');

    return request(BYSE_BUNDLE_URL).then(function(res) {
        var code = res.body;

        // Buscar todas las ocurrencias de operation: "..." o operation: '...'
        var opRegex = /operation:\s*["']([a-zA-Z0-9_\/-]+)["']/g;
        var ops = [];
        var m;
        while ((m = opRegex.exec(code)) !== null) {
            if (ops.indexOf(m[1]) === -1) ops.push(m[1]);
        }
        console.log('[OPERACIONES ENCONTRADAS EN EL JS]:', ops);

        // Buscar llamadas que contengan el parámetro file_code
        var fcIdx = code.indexOf('file_code');
        var snippets = 0;
        while (fcIdx !== -1 && snippets < 3) {
            console.log('\n--- Fragmento file_code #' + (snippets + 1) + ' ---');
            console.log(code.substring(Math.max(0, fcIdx - 60), Math.min(code.length, fcIdx + 160)).replace(/\s+/g, ' '));
            fcIdx = code.indexOf('file_code', fcIdx + 1);
            snippets++;
        }

        console.log('\n============================================================');
        console.log('>>> 2. PROBANDO ENDPOINTS API CANDIDATOS EN BYSE');
        console.log('============================================================');

        // Construir candidatos usando las operaciones detectadas o comunes
        var candidates = [
            'https://byseraguci.com/api/file?file_code=' + FILE_CODE,
            'https://byseraguci.com/api/files/' + FILE_CODE,
            'https://byseraguci.com/api/embed?file_code=' + FILE_CODE,
            'https://byseraguci.com/api/player?file_code=' + FILE_CODE,
            'https://byseraguci.com/api/stream/' + FILE_CODE
        ];

        // Añadir las operaciones descubiertas dinámicamente si no están en la lista
        ops.forEach(function(op) {
            var u1 = 'https://byseraguci.com/api/' + op + '?file_code=' + FILE_CODE;
            var u2 = 'https://byseraguci.com/api/' + op + '/' + FILE_CODE;
            if (candidates.indexOf(u1) === -1) candidates.push(u1);
            if (candidates.indexOf(u2) === -1) candidates.push(u2);
        });

        function tryCandidate(idx) {
            if (idx >= candidates.length) return Promise.resolve();
            var target = candidates[idx];

            return request(target).then(function(cRes) {
                if (cRes.status !== 404) {
                    console.log('[' + cRes.status + '] ' + target);
                    console.log('    Body: ' + cRes.body.substring(0, 180).replace(/\s+/g, ' '));
                }
                return tryCandidate(idx + 1);
            }).catch(function() {
                return tryCandidate(idx + 1);
            });
        }

        return tryCandidate(0);
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase12();
