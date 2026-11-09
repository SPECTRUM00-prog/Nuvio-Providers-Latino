/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 2 - Gateway mp4.nu y Mapeo)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://www2.pelisforte.se';
var KNOWN_MOVIE_PATH = '/pelicula/paranorman-2012-1699022692';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, headers, timeoutMs) {
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
            timeout: timeoutMs || 8000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    location: res.headers.location,
                    elapsed: Date.now() - startTime,
                    body: Buffer.concat(chunks).toString('utf8'),
                    url: targetUrl
                });
            });
        });

        req.on('timeout', function() {
            req.destroy();
            reject(new Error('TIMEOUT'));
        });
        req.on('error', reject);
        req.end();
    });
}

function printSection(title) {
    console.log('\n============================================================');
    console.log('>>> ' + title);
    console.log('============================================================');
}

function runAuditPhase2() {
    printSection('1. ANALIZANDO EL MAPEO DE OPCIONES EN LA FICHA');

    return request(BASE_URL + KNOWN_MOVIE_PATH).then(function(res) {
        var html = res.body;

        // Extraer el bloque completo de <aside class="video-options">
        var asideIdx = html.indexOf('class="video-options"');
        if (asideIdx !== -1) {
            var asideSnippet = html.substring(asideIdx - 20, Math.min(html.length, asideIdx + 2000));
            console.log('[BLOQUE DE OPCIONES HTML]:\n' + asideSnippet.replace(/\t/g, ' ') + '\n');
        }

        // Extraer los contenedores de los reproductores y sus iframes
        var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
        var iframes = [];
        var m;
        while ((m = iframeRegex.exec(html)) !== null) {
            iframes.push(m[1]);
        }

        printSection('2. AUDITORÍA DEL GATEWAY mp4.nu (PROBANDO LOS 2 PRIMEROS: BYSE Y OK)');
        console.log('Total iframes detectados: ' + iframes.length);

        function testGateway(idx) {
            if (idx >= Math.min(3, iframes.length)) return Promise.resolve();
            var targetIframe = iframes[idx];
            console.log('\n--- Probando Gateway #' + (idx + 1) + ' ---');
            console.log('URL: ' + targetIframe.substring(0, 80) + '...');

            return request(targetIframe, { 'Referer': BASE_URL + KNOWN_MOVIE_PATH })
                .then(function(gwRes) {
                    console.log('Status: ' + gwRes.status + ' (' + gwRes.elapsed + ' ms)');
                    if (gwRes.location) {
                        console.log('-> REDIRECCIÓN A: ' + gwRes.location);
                    }

                    // Buscar iframes internos o scripts de video
                    var innerIframes = gwRes.body.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
                    console.log('Iframes internos en mp4.nu: ' + innerIframes.length);
                    innerIframes.forEach(function(ifr) {
                        console.log('    ' + ifr);
                    });

                    // Buscar enlaces directos en el cuerpo
                    var videoUrls = gwRes.body.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*/gi) || [];
                    console.log('Streams de video directos encontrados: ' + videoUrls.length);
                    videoUrls.forEach(function(v) {
                        console.log('    Stream: ' + v.substring(0, 90) + '...');
                    });

                    // Si no hay video directo ni iframe, mostrar un preview
                    if (innerIframes.length === 0 && videoUrls.length === 0) {
                        console.log('Preview del cuerpo:\n' + gwRes.body.substring(0, 350).replace(/\s+/g, ' '));
                    }

                    return testGateway(idx + 1);
                })
                .catch(function(err) {
                    console.log('Error probando ' + targetIframe + ': ' + err.message);
                    return testGateway(idx + 1);
                });
        }

        return testGateway(0);
    }).catch(function(err) {
        console.log('Error general:', err.message);
    });
}

runAuditPhase2();
