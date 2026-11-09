/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 9 - Gateways Restantes y Series)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://www2.pelisforte.se';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

var TOKENS = [
    { label: 'Opción 3', token: 'YUNUajB3bE4wNWFKZ0Zsc2lkdVFvUWsrUEY4bnlPRGlvZUM2Rjd0cnFsMFl4Z3FmT0Jad0RRc2p4Q2xkM2ZwM0Z6Z3g5SmZCQW11TC9rL3hoakN3VHFySG1NYzhWZGdwN0tEdDVuUVo1WmtzaHJIRHBDaTB2QXJoTE04ZWEydVJiKzVCY2V6cytRaXRPUFF5aUVRZ1FnPT0' },
    { label: 'Opción 4', token: 'OE5LMVVvd0xyZjBTR3lOZmY1Vm9ubkU2OE1YWE9PUXhqWlcrek44TjZjeCsydFAwSWtmcTFsbnpUMEFySkVzVFlHVGluYVA4OXg3REZPeDhzK05sMnZhL3RsbU1lanlPZE1oZkxEK2w0c009' },
    { label: 'Opción 5', token: 'OE5LMVVvd0xyZjBTR3lOZmY1Vm9ubkU2OE1YWE9PUXhqWlcrek44TjZjeCsydFAwSWtmcTFsbnpUMEFySkVzVFRZZDVKYWp3S25UcmFucmdUTWFSSU45cEpWMnl4ekJnZldRWVp6K0tJL2c9' }
];

function request(targetUrl, headers) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Referer': BASE_URL + '/'
        }, headers || {});

        var startTime = Date.now();
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: reqHeaders,
            timeout: 7000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var redirectUrl = res.headers.location.indexOf('http') === 0 ? 
                                  res.headers.location : 
                                  (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve({
                    status: res.statusCode,
                    location: redirectUrl,
                    elapsed: Date.now() - startTime
                });
            }

            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    location: res.headers.location,
                    body: Buffer.concat(chunks).toString('utf8'),
                    elapsed: Date.now() - startTime
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase9() {
    console.log('\n============================================================');
    console.log('>>> 1. AUDITANDO SERVIDORES EN LAS OPCIONES 3, 4 Y 5');
    console.log('============================================================');

    function probeTokens(idx) {
        if (idx >= TOKENS.length) return Promise.resolve();
        var item = TOKENS[idx];
        var rUrl = 'https://mp4.nu/r.php?h=' + encodeURIComponent(item.token);

        return request(rUrl, { 'Referer': 'https://mp4.nu/' })
            .then(function(res) {
                console.log('[' + item.label + '] Status: ' + res.status + ' (' + res.elapsed + 'ms)');
                if (res.location) {
                    console.log('    -> Destino: ' + res.location);
                } else if (res.body) {
                    var m = res.body.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*/);
                    if (m) console.log('    -> Stream: ' + m[0]);
                }
                return probeTokens(idx + 1);
            })
            .catch(function(err) {
                console.log('[' + item.label + ' ERROR]: ' + err.message);
                return probeTokens(idx + 1);
            });
    }

    return probeTokens(0)
        .then(function() {
            console.log('\n============================================================');
            console.log('>>> 2. INSPECCIONANDO EL CATÁLOGO DE SERIES (/series-1746289646)');
            console.log('============================================================');

            return request(BASE_URL + '/series-1746289646');
        })
        .then(function(res) {
            console.log('[STATUS SERIES ROOT]: ' + res.status + ' (' + res.elapsed + ' ms)');
            
            // Buscar tarjetas de series
            var seriesRegex = /<a[^>]+href=["'](https?:\/\/[^"']*\/(?:serie|series)\/[^"']+)["'][^>]*>/gi;
            var seriesUrls = [];
            var match;
            while ((match = seriesRegex.exec(res.body)) !== null) {
                if (seriesUrls.indexOf(match[1]) === -1) seriesUrls.push(match[1]);
            }

            console.log('[SERIES ENCONTRADAS EN CATÁLOGO]: ' + seriesUrls.length);
            seriesUrls.slice(0, 4).forEach(function(u) {
                console.log('  -> ' + u);
            });

            if (seriesUrls.length > 0) {
                console.log('\n>>> 3. INSPECCIONANDO TEMPORADAS Y EPISODIOS DE LA SERIE #1:');
                console.log('URL: ' + seriesUrls[0]);
                return request(seriesUrls[0]).then(function(sRes) {
                    console.log('[STATUS SERIE]: ' + sRes.status);
                    
                    // Buscar enlaces a episodios
                    var epRegex = /href=["'](https?:\/\/[^"']*(?:episodio|capitulo|season|temporada)[^"']*)["']/gi;
                    var epUrls = [];
                    var mEp;
                    while ((mEp = epRegex.exec(sRes.body)) !== null) {
                        if (epUrls.indexOf(mEp[1]) === -1) epUrls.push(mEp[1]);
                    }

                    console.log('[EPISODIOS DETECTADOS EN LA SERIE]: ' + epUrls.length);
                    epUrls.slice(0, 6).forEach(function(ep) {
                        console.log('    * ' + ep);
                    });
                });
            }
        })
        .catch(function(err) {
            console.log('Error general:', err.message);
        });
}

runAuditPhase9();
