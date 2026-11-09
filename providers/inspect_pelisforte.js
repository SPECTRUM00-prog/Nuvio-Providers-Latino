/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 8 - Formato de Tarjetas y Byse Direct)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://www2.pelisforte.se';
var BYSE_DIRECT_URL = 'https://byseraguci.com/d/tiumae2gw611/P4N0RM-18LA.mp4';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, headers) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': BASE_URL + '/'
        }, headers || {});

        var startTime = Date.now();
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: reqHeaders,
            timeout: 8000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var redirectUrl = res.headers.location.indexOf('http') === 0 ? 
                                  res.headers.location : 
                                  (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve(request(redirectUrl, headers));
            }

            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                    elapsed: Date.now() - startTime
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase8() {
    console.log('\n============================================================');
    console.log('>>> 1. VOLCANDO EL HTML EXACTO DE LA TARJETA EN BÚSQUEDA');
    console.log('============================================================');

    return request(BASE_URL + '/?s=paranorman')
        .then(function(res) {
            // Extraer el bloque completo donde aparece paranorman
            var idx = res.body.indexOf('paranorman-2012');
            if (idx !== -1) {
                var cardSnippet = res.body.substring(Math.max(0, idx - 150), Math.min(res.body.length, idx + 450));
                console.log('[SNIPPET HTML DE LA TARJETA]:\n' + cardSnippet.replace(/\t/g, ' ') + '\n');
            }

            console.log('============================================================');
            console.log('>>> 2. INSPECCIONANDO MENÚ PRINCIPAL (SERIES / CATEGORÍAS)');
            console.log('============================================================');

            var menuMatches = res.body.match(/<a[^>]+href=["'](https?:\/\/[^"']*(?:serie|genero|tv|top)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
            console.log('Enlaces de menú detectados: ' + menuMatches.length);
            menuMatches.slice(0, 8).forEach(function(m) {
                console.log('  -> ' + m.replace(/\s+/g, ' '));
            });

            console.log('\n============================================================');
            console.log('>>> 3. PROBANDO RUTA DIRECTA DE BYSE (/d/ en vez de /e/)');
            console.log('============================================================');

            return request(BYSE_DIRECT_URL, { 'Referer': 'https://byseraguci.com/' });
        })
        .then(function(byseRes) {
            console.log('[STATUS BYSE /d/]: ' + byseRes.status + ' (' + byseRes.elapsed + ' ms)');
            console.log('[CONTENT-TYPE]: ' + (byseRes.headers['content-type'] || 'N/A'));
            if (byseRes.headers.location) {
                console.log('[REDIRECCIÓN DIRECTA]: ' + byseRes.headers.location);
            }
            // Si es video directo o html
            if ((byseRes.headers['content-type'] || '').indexOf('video') !== -1 || (byseRes.headers['content-type'] || '').indexOf('octet-stream') !== -1) {
                console.log('>>> ¡BYSE /d/ ES UN STREAM DE VIDEO DIRECTO!');
            } else {
                var m3u8 = byseRes.body.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi);
                if (m3u8) {
                    console.log('>>> Streams encontrados en /d/:\n', m3u8);
                } else {
                    console.log('Preview /d/:\n' + byseRes.body.substring(0, 250).replace(/\s+/g, ' '));
                }
            }
        })
        .catch(function(err) {
            console.log('Error:', err.message);
        });
}

runAuditPhase8();
