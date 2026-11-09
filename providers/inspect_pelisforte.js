/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 4 - Redirector r.php)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var http = require('http');
var urlModule = require('url');

var TOKEN_BYSE = 'YUNUajB3bE4wNWFKZ0Zsc2lkdVFvUWsrUEY4bnlPRGlvZUM2Rjd0cnFsMVZqMnVjT1phSmRqM0tndHlobXNjYlgzY1ltN3BscXc4UEtiUXg3QXlCdC9wdXhLS05HZm9wNitWcEwvcUFBaEpMYjNZM01QOGtQOHJvczE1UDVnMnFoSU9sSHczNzZWemFvTXlmQ0U3dHpnPT0';
var TOKEN_OK = 'OE5LMVVvd0xyZjBTR3lOZmY1Vm9ubkU2OE1YWE9PUXhqWlcrek44TjZjeCsydFAwSWtmcTFsbnpUMEFySkVzVFRxa1pXTS9EdXg5Sk5DV1FPZzB6bXNCNE9wREx2NkZ2MWJEcURPemZsNnc9';

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, referer) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var lib = parsed.protocol === 'https:' ? https : http;

        var req = lib.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': referer || 'https://mp4.nu/'
            },
            timeout: 7000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    location: res.headers.location,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function probeRedirector(label, token) {
    var initialUrl = 'https://mp4.nu/?h=' + encodeURIComponent(token);
    var targetR = 'https://mp4.nu/r.php?h=' + encodeURIComponent(token);

    console.log('\n============================================================');
    console.log('>>> PROBANDO r.php PARA ' + label);
    console.log('============================================================');

    return request(targetR, initialUrl).then(function(res) {
        console.log('[STATUS]: ' + res.status);
        if (res.location) {
            console.log('>>> [REDIRECCIÓN 302 ENCONTRADA] -> ' + res.location);
            // Seguir la redirección
            return request(res.location, targetR).then(function(destRes) {
                console.log('[DESTINO FINAL STATUS]: ' + destRes.status);
                var m3u8 = destRes.body.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi);
                if (m3u8) {
                    console.log('>>> [STREAM HLS DETECTADO]:', m3u8[0]);
                } else {
                    console.log('Preview destino:\n' + destRes.body.substring(0, 300).replace(/\s+/g, ' '));
                }
            });
        } else {
            console.log('No hubo redirección HTTP.');
            // Buscar window.location o iframe en el cuerpo de r.php
            var locMatch = res.body.match(/window\.location(?:\.replace)?\(["']([^"']+)["']\)/i) ||
                           res.body.match(/href=["'](https?:\/\/[^"']+)["']/i) ||
                           res.body.match(/src=["'](https?:\/\/[^"']+)["']/i);
            if (locMatch) {
                console.log('>>> [DESTINO DETECTADO EN JS/HTML]: ' + locMatch[1]);
            } else {
                console.log('Cuerpo r.php:\n' + res.body.substring(0, 400));
            }
        }
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

probeRedirector('BYSE (Opción 1)', TOKEN_BYSE)
    .then(function() {
        return probeRedirector('OK.RU (Opción 2)', TOKEN_OK);
    });
