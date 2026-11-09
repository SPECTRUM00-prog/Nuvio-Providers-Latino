/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte
 * Objetivo: Reemplazo oficial de PelisPlus con soporte para doblajes originales (BYSE / OK.ru)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var DOMAINS = [
    'https://www2.pelisforte.se',
    'https://pelisforte.se'
];

var KNOWN_MOVIE_PATH = '/pelicula/paranorman-2012-1699022692';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, headers, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
            'Referer': targetUrl
        }, headers || {});

        var startTime = Date.now();
        var req = https.request({
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.path,
            method: 'GET',
            headers: reqHeaders,
            timeout: timeoutMs || 8000
        }, function(res) {
            // Manejar redirecciones (301, 302, 307, 308)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var redirectUrl = res.headers.location.indexOf('http') === 0 ? 
                                  res.headers.location : 
                                  (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve(request(redirectUrl, headers, timeoutMs));
            }

            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    elapsed: Date.now() - startTime,
                    body: Buffer.concat(chunks).toString('utf8'),
                    finalUrl: targetUrl
                });
            });
        });

        req.on('timeout', function() {
            req.destroy();
            reject(new Error('TIMEOUT (' + (timeoutMs || 8000) + 'ms)'));
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

function runAudit() {
    printSection('1. VERIFICACIÓN DE CONECTIVIDAD Y DOMINIO ACTIVO');

    var activeDomain = DOMAINS[0];

    return request(activeDomain)
        .then(function(res) {
            console.log('[STATUS ROOT]: ' + res.status + ' (' + res.elapsed + ' ms)');
            console.log('[SERVER]: ' + (res.headers.server || 'N/A'));

            printSection('2. AUDITORÍA DEL BUSCADOR: paranormal / paranorman');
            var searchUrls = [
                activeDomain + '/buscar?q=paranorman',
                activeDomain + '/?s=paranorman',
                activeDomain + '/search?q=paranorman'
            ];

            function trySearch(idx) {
                if (idx >= searchUrls.length) return Promise.resolve(null);
                var u = searchUrls[idx];
                return request(u).then(function(sRes) {
                    var hasResults = sRes.body.indexOf('/pelicula/') !== -1;
                    console.log('[' + sRes.status + '] ' + u + ' | ¿Detecta enlaces /pelicula/?: ' + hasResults);
                    if (hasResults) return u;
                    return trySearch(idx + 1);
                });
            }

            return trySearch(0);
        })
        .then(function() {
            printSection('3. INSPECCIÓN DE LA FICHA DIRECTA: ' + KNOWN_MOVIE_PATH);
            var targetPage = activeDomain + KNOWN_MOVIE_PATH;
            return request(targetPage);
        })
        .then(function(res) {
            console.log('[STATUS FICHA]: ' + res.status + ' (' + res.elapsed + ' ms)');
            var html = res.body;

            // 1. Extraer pestañas de idiomas (Latino, Castellano, Sub)
            printSection('4. ANÁLISIS DE PESTAÑAS Y SELECTORES DE REPRODUCTOR');
            var tabs = html.match(/<(?:button|li|div|a)[^>]+(?:data-[^>]+|class=["'][^"']*(?:tab|lang|option)[^"']*["'])[^>]*>[\s\S]*?<\/(?:button|li|div|a)>/gi) || [];
            console.log('[ELEMENTOS DE CONTROL DETECTADOS]: ' + tabs.length);
            tabs.slice(0, 8).forEach(function(t, i) {
                console.log('  [' + i + '] ' + t.replace(/\s+/g, ' ').substring(0, 140));
            });

            // 2. Extraer todos los iframes presentes en el HTML inicial
            var iframes = [];
            var ifrRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
            var m;
            while ((m = ifrRegex.exec(html)) !== null) {
                if (iframes.indexOf(m[1]) === -1) iframes.push(m[1]);
            }
            console.log('\n[IFRAMES EN HTML INICIAL]: ' + iframes.length);
            iframes.forEach(function(ifr) { console.log('  -> ' + ifr); });

            // 3. Buscar datos incrustados en JavaScript (JSON de reproductores, AJAX, variables)
            printSection('5. INSPECCIÓN DE REPRODUCTORES INCRUSTADOS EN SCRIPTS');
            var scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
            var playerMatches = [];
            while ((m = scriptRegex.exec(html)) !== null) {
                var sCode = m[1];
                if (sCode.indexOf('video') !== -1 || sCode.indexOf('player') !== -1 || sCode.indexOf('byse') !== -1 || sCode.indexOf('ok.ru') !== -1) {
                    playerMatches.push(sCode);
                }
            }
            console.log('[SCRIPTS CON DATOS DE REPRODUCTORES DETECTADOS]: ' + playerMatches.length);
            playerMatches.forEach(function(code, idx) {
                console.log('\n--- Script Match #' + (idx + 1) + ' ---');
                var lines = code.split('\n').filter(function(l) {
                    return l.indexOf('http') !== -1 || l.indexOf('player') !== -1 || l.indexOf('byse') !== -1 || l.indexOf('ok.ru') !== -1;
                });
                lines.slice(0, 10).forEach(function(l) {
                    console.log('  ' + l.trim().substring(0, 160));
                });
            });

            // 4. Buscar menciones explícitas de BYSE y OK.ru
            var byseRegex = /https?:\/\/[^"'\s<>]*(?:byse|bytebx|byter)[^"'\s<>]*/gi;
            var okRegex = /https?:\/\/(?:www\.)?ok\.ru\/videoembed\/[0-9]+/gi;

            var byseUrls = html.match(byseRegex) || [];
            var okUrls = html.match(okRegex) || [];

            console.log('\n[ENLACES DIRECTOS A BYSE]: ' + byseUrls.length);
            byseUrls.forEach(function(u) { console.log('  -> BYSE: ' + u); });

            console.log('\n[ENLACES DIRECTOS A OK.RU]: ' + okUrls.length);
            okUrls.forEach(function(u) { console.log('  -> OK.ru: ' + u); });

            // 5. Probar resolución del stream si hay enlace de OK.ru
            if (okUrls.length > 0) {
                printSection('6. AUDITORÍA DE STREAM EN OK.RU: ' + okUrls[0]);
                return request(okUrls[0]).then(function(okRes) {
                    console.log('[OK.RU STATUS]: ' + okRes.status);
                    var hasDataOptions = okRes.body.indexOf('data-options=') !== -1;
                    console.log('[¿Contiene data-options con MP4/HLS?]: ' + hasDataOptions);
                    if (hasDataOptions) {
                        var jsonMatch = okRes.body.match(/data-options=["']([^"']+)["']/);
                        if (jsonMatch) {
                            try {
                                var decoded = jsonMatch[1].replace(/&quot;/g, '"');
                                var parsed = JSON.parse(decoded);
                                var videos = (parsed.flashvars && parsed.flashvars.metadata) ? JSON.parse(parsed.flashvars.metadata).videos : [];
                                console.log('[CALIDADES MP4 EXTRAÍDAS DE OK.RU]:');
                                videos.forEach(function(v) {
                                    console.log('  - ' + v.name + ': ' + v.url.substring(0, 100) + '...');
                                });
                            } catch(e) {
                                console.log('[OK.RU PARSER ERROR]:', e.message);
                            }
                        }
                    }
                });
            }
        })
        .catch(function(err) {
            printSection('❌ ERROR EN AUDITORÍA');
            console.log('Mensaje:', err.message);
            if (err.cause) console.log('Causa:', err.cause);
        });
}

runAudit();
