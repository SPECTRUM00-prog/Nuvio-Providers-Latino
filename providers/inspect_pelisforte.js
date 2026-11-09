/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 5 - Extracción de Streams en BYSE y OK.ru)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BYSE_URL = 'https://byseraguci.com/e/tiumae2gw611/P4N0RM-18LA.mp4';
var OK_URL = 'https://ok.ru/videoembed/9411855649280'; // Sin barra final para evitar 301
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
            // Manejar 301 / 302
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

function runAuditPhase5() {
    console.log('\n============================================================');
    console.log('>>> 1. RESOLVIENDO STREAM DE OK.RU (DOBLAJE ORIGINAL)');
    console.log('============================================================');

    return request(OK_URL)
        .then(function(res) {
            console.log('[OK.RU STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');

            // Buscar data-options
            var match = res.body.match(/data-options=["']([^"']+)["']/);
            if (match) {
                try {
                    var decoded = match[1].replace(/&quot;/g, '"');
                    var data = JSON.parse(decoded);
                    var metadata = data.flashvars && data.flashvars.metadata ? JSON.parse(data.flashvars.metadata) : null;

                    if (metadata) {
                        console.log('✓ Metadata de OK.ru extraída con éxito:');
                        if (metadata.hlsMasterPlaylistUrl) {
                            console.log('  -> [HLS MASTER PLAYLIST]: ' + metadata.hlsMasterPlaylistUrl);
                        }
                        if (metadata.videos && Array.isArray(metadata.videos)) {
                            console.log('  -> [VIDEOS MP4 DIRECTOS ENCONTRADOS]: ' + metadata.videos.length);
                            metadata.videos.forEach(function(v) {
                                console.log('     * Calidad: ' + v.name + ' | URL: ' + v.url.substring(0, 90) + '...');
                            });
                        }
                    }
                } catch (e) {
                    console.log('[OK.RU PARSE ERROR]:', e.message);
                }
            } else {
                console.log('[OK.RU ALERTA]: No se encontró atributo data-options en el HTML');
                console.log('Preview OK.ru:\n' + res.body.substring(0, 300));
            }

            console.log('\n============================================================');
            console.log('>>> 2. RESOLVIENDO STREAM DE BYSE');
            console.log('============================================================');

            return request(BYSE_URL);
        })
        .then(function(resByse) {
            console.log('[BYSE STATUS]: ' + resByse.status + ' (' + resByse.elapsed + ' ms)');

            // 1. Buscar enlaces m3u8 o mp4
            var streams = resByse.body.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi) || [];
            console.log('[STREAMS DIRECTOS EN BYSE]: ' + streams.length);
            streams.forEach(function(s) { console.log('  -> ' + s); });

            // 2. Buscar packed JS
            var hasPacked = resByse.body.indexOf('eval(function(p,a,c,k,e,') !== -1;
            console.log('[¿Contiene Packed JS (Dean Edwards)?]: ' + hasPacked);

            // 3. Buscar fuentes en etiquetas <source> o setup de video
            var sources = resByse.body.match(/(?:file|sources?|src)\s*:\s*["']([^"']+)["']/gi) || [];
            console.log('[FUENTES DETECTADAS EN CÓDIGO]: ' + sources.length);
            sources.forEach(function(src) { console.log('  -> ' + src); });

            if (streams.length === 0 && !hasPacked && sources.length === 0) {
                console.log('\n[PREVIEW HTML BYSE]:\n' + resByse.body.substring(0, 600).replace(/\s+/g, ' '));
            }
        })
        .catch(function(err) {
            console.log('Error general:', err.message);
        });
}

runAuditPhase5();
