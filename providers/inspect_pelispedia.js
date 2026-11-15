/**
 * Verificación de mirrors/reproductores alternativos fuera de embed69.org
 * en PelisPedia y SoloLatino.
 * Ejecutar: node providers/inspect_pelispedia.js
 */

var https = require('https');
var urlModule = require('url');

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, referer) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
                'Referer': referer || (parsed.protocol + '//' + parsed.host + '/')
            },
            timeout: 7000
        }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var nextUrl = res.headers.location.indexOf('http') === 0
                    ? res.headers.location
                    : (parsed.protocol + '//' + parsed.host + res.headers.location);
                return resolve(request(nextUrl, targetUrl));
            }
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    finalUrl: targetUrl,
                    body: Buffer.concat(chunks).toString('utf8')
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

function inspectPlayersInHtml(label, html, baseUrl) {
    console.log('\n============================================================');
    console.log('>>> ANALIZANDO PLAYERS EN: ' + label);
    console.log('============================================================');

    // 1. Iframes (src y data-src)
    var iframes = [];
    var ifrRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
    var m;
    while ((m = ifrRegex.exec(html)) !== null) {
        if (iframes.indexOf(m[1]) === -1) iframes.push(m[1]);
    }
    console.log('[IFRAMES DETECTADOS]:', iframes);

    // 2. Atributos de opciones/botones (data-url, data-embed, data-src, data-id, data-player)
    var dataAttrs = [];
    var attrRegex = /(?:data-url|data-embed|data-src|data-video|data-player|data-link)=["']([^"']+)["']/gi;
    while ((m = attrRegex.exec(html)) !== null) {
        if (dataAttrs.indexOf(m[1]) === -1) dataAttrs.push(m[1]);
    }
    console.log('[ATRIBUTOS DATA-* DE REPRODUCTOR]:', dataAttrs);

    // 3. Menciones a lockers o embeds en el HTML / scripts inline
    var hosts = html.match(/https?:\/\/[^"'\s<>\\]*(?:embed69|vidhide|streamwish|hlswish|hglink|filemoon|vimeos|ok\.ru|voe|dood|mixdrop|vidurl|xupalace|waaw|uqload)[^"'\s<>\\]*/gi) || [];
    var uniqueHosts = [];
    hosts.forEach(function(h) {
        if (uniqueHosts.indexOf(h) === -1) uniqueHosts.push(h);
    });
    console.log('[URLS DE EMBEDS / LOCKERS ENCONTRADAS]:', uniqueHosts.slice(0, 15));

    // 4. Probar si hay /vidurl/ u otra ruta intermedia dentro del propio sitio
    var vidurls = uniqueHosts.filter(function(u) { return u.indexOf('/vidurl/') !== -1 || u.indexOf('xupalace') !== -1; });
    if (vidurls.length > 0) {
        var target = vidurls[0].indexOf('http') === 0 ? vidurls[0] : (baseUrl + vidurls[0]);
        console.log('\n[SIGUIENDO INTERMEDIARIO]: ' + target);
        return request(target, baseUrl + '/').then(function(r) {
            console.log('  -> Status:', r.status, '| Final URL:', r.finalUrl);
            var subIfr = r.body.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
            console.log('  -> Iframes dentro:', subIfr);
            var subUrls = r.body.match(/https?:\/\/[^"'\s<>\\]*(?:embed69|vidhide|streamwish|hlswish|filemoon|vimeos|ok\.ru|voe|dood|dataLink)[^"'\s<>\\]*/gi) || [];
            console.log('  -> URLs detectadas dentro:', subUrls.slice(0, 10));
        }).catch(function(err) {
            console.log('  -> Error siguiendo intermediario:', err.message, err.cause || '');
        });
    }
    return Promise.resolve();
}

function run() {
    // 1. PelisPedia Matrix
    return request('https://pelispedia.mov/pelicula/matrix')
        .then(function(res) {
            console.log('[PELISPEDIA STATUS]:', res.status, '| Bytes:', res.body.length);
            return inspectPlayersInHtml('PelisPedia (/pelicula/matrix)', res.body, 'https://pelispedia.mov');
        })
        .catch(function(err) {
            console.log('[PELISPEDIA ERROR]:', err.message, err.cause || '');
        })
        .then(function() {
            // 2. SoloLatino búsqueda Matrix
            console.log('\n============================================================');
            console.log('>>> BUSCANDO MATRIX EN SOLOLATINO');
            console.log('============================================================');
            return request('https://sololatino.net/?s=matrix');
        })
        .then(function(sRes) {
            console.log('[SOLOLATINO SEARCH STATUS]:', sRes.status, '| Bytes:', sRes.body.length);
            var links = sRes.body.match(/https?:\/\/sololatino\.net\/peliculas\/[^"'\s<>]+/gi) || [];
            var unique = [];
            links.forEach(function(l) { if (unique.indexOf(l) === -1) unique.push(l); });
            console.log('[ENLACES EN SOLOLATINO]:', unique.slice(0, 5));

            if (unique.length > 0) {
                return request(unique[0], 'https://sololatino.net/').then(function(mRes) {
                    console.log('[SOLOLATINO FICHA STATUS]:', mRes.status, '| Bytes:', mRes.body.length);
                    return inspectPlayersInHtml('SoloLatino (' + unique[0] + ')', mRes.body, 'https://sololatino.net');
                });
            }
        })
        .catch(function(err) {
            console.log('[SOLOLATINO ERROR]:', err.message, err.cause || '');
        });
}

run();
