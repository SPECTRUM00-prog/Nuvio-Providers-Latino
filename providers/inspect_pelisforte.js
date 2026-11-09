/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 6 - Extracción Final de Streams)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BYSE_URL = 'https://byseraguci.com/e/tiumae2gw611/P4N0RM-18LA.mp4';
var OK_URL = 'https://ok.ru/videoembed/9411855649280';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, headers) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://mp4.nu/'
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
                    elapsed: Date.now() - startTime,
                    body: Buffer.concat(chunks).toString('utf8'),
                    url: targetUrl
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase6() {
    console.log('\n============================================================');
    console.log('>>> 1. EXTRACCIÓN CONFIRMADA DE OK.RU (DOBLAJE ORIGINAL)');
    console.log('============================================================');

    return request(OK_URL)
        .then(function(res) {
            var match = res.body.match(/data-options=["']([^"']+)["']/);
            if (match) {
                var decoded = match[1].replace(/&quot;/g, '"');
                var data = JSON.parse(decoded);
                // Si ya es objeto, usarlo directamente; si es string, parsearlo
                var rawMeta = data.flashvars && data.flashvars.metadata;
                var metadata = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;

                if (metadata) {
                    if (metadata.hlsMasterPlaylistUrl) {
                        console.log('>>> [HLS MASTER PLAYLIST DIRECTO]:\n' + metadata.hlsMasterPlaylistUrl);
                    }
                    if (metadata.videos && Array.isArray(metadata.videos)) {
                        console.log('\n>>> [STREAMS MP4 DIRECTOS POR CALIDAD]: ' + metadata.videos.length);
                        metadata.videos.forEach(function(v) {
                            console.log('  - [' + v.name + '] -> ' + v.url);
                        });
                    }
                }
            }

            console.log('\n============================================================');
            console.log('>>> 2. INSPECCIONANDO EL SCRIPT COMPLETO DE BYSE');
            console.log('============================================================');

            return request(BYSE_URL);
        })
        .then(function(resByse) {
            var scripts = resByse.body.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
            scripts.forEach(function(s, idx) {
                console.log('\n--- Script #' + (idx + 1) + ' de Byse ---');
                console.log(s.replace(/<script\b[^>]*>|<\/script>/gi, '').trim());
            });

            // Buscar bundles externos .js en byse
            var srcScripts = resByse.body.match(/src=["']([^"']+\.js[^"']*)["']/gi) || [];
            if (srcScripts.length > 0) {
                console.log('\n[SCRIPTS EXTERNOS DE BYSE]:');
                srcScripts.forEach(function(src) { console.log('  -> ' + src); });
            }
        })
        .catch(function(err) {
            console.log('Error:', err.message);
        });
}

runAuditPhase6();
