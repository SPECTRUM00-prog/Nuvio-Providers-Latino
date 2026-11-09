/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 15 - Endpoint Playback de Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var FILE_CODE = 'tiumae2gw611';
var BYSE_BUNDLE_URL = 'https://byseraguci.com/assets/videoPagesBundle-Bgi0QmPo.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url) {
    return new Promise(function(resolve, reject) {
        var parsed = new URL(url);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://byseraguci.com/e/' + FILE_CODE
            },
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

function runAuditPhase15() {
    console.log('\n============================================================');
    console.log('>>> 1. INSPECCIONANDO DEFINICIÓN DE Te Y nt EN BYSE');
    console.log('============================================================');

    return request(BYSE_BUNDLE_URL).then(function(res) {
        var code = res.body;

        // Buscar Te= o function Te
        var teIdx = code.indexOf('Te=');
        if (teIdx !== -1) {
            console.log('[DEFINICIÓN DE Te]:');
            console.log(code.substring(Math.max(0, teIdx - 20), Math.min(code.length, teIdx + 200)).replace(/\s+/g, ' '));
        }

        // Buscar nt= o function nt
        var ntIdx = code.indexOf('nt=');
        if (ntIdx !== -1) {
            console.log('\n[DEFINICIÓN DE nt]:');
            console.log(code.substring(Math.max(0, ntIdx - 20), Math.min(code.length, ntIdx + 200)).replace(/\s+/g, ' '));
        }

        console.log('\n============================================================');
        console.log('>>> 2. PROBANDO ENDPOINTS CANDIDATOS DE PLAYBACK / DETAILS');
        console.log('============================================================');

        var candidates = [
            'https://byseraguci.com/api/videos/' + FILE_CODE + '/playback',
            'https://byseraguci.com/api/videos/' + FILE_CODE + '/details',
            'https://byseraguci.com/api/videos/' + FILE_CODE + '/settings',
            'https://byseraguci.com/api/videos/embed/' + FILE_CODE + '/playback',
            'https://byseraguci.com/api/videos/embed/' + FILE_CODE + '/details',
            'https://byseraguci.com/api/videos/' + FILE_CODE + '?mode=embed'
        ];

        function tryNext(idx) {
            if (idx >= candidates.length) return Promise.resolve();
            var target = candidates[idx];

            return request(target).then(function(r) {
                console.log('[' + r.status + '] ' + target);
                if (r.status === 200 || r.status === 206) {
                    console.log('>>> ¡RESPUESTA EXITOSA EN ' + target + '!');
                    console.log('    JSON/Body preview: ' + r.body.substring(0, 300));
                } else if (r.status !== 404) {
                    console.log('    Body: ' + r.body.substring(0, 150));
                }
                return tryNext(idx + 1);
            }).catch(function() {
                return tryNext(idx + 1);
            });
        }

        return tryNext(0);
    });
}

runAuditPhase15();
