/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 3 - Reverse del Player mp4.nu)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var GATEWAY_URL = 'https://mp4.nu/?h=YUNUajB3bE4wNWFKZ0Zsc2lkdVFvUWsrUEY4bnlPRGlvZUM2Rjd0cnFsMVZqMnVjT1phSmRqM0tndHlobXNjYlgzY1ltN3BscXc4UEtiUXg3QXlCdC9wdXhLS05HZm9wNitWcEwvcUFBaEpMYjNZM01QOGtQOHJvczE1UDVnMnFoSU9sSHczNzZWemFvTXlmQ0U3dHpnPT0';
var GATEWAY_OK_URL = 'https://mp4.nu/?h=OE5LMVVvd0xyZjBTR3lOZmY1Vm9ubkU2OE1YWE9PUXhqWlcrek44TjZjeCsydFAwSWtmcTFsbnpUMEFySkVzVFRxa1pXTS9EdXg5Sk5DV1FPZzB6bXNCNE9wREx2NkZ2MWJEcURPemZsNnc9';
var REFERER = 'https://www2.pelisforte.se/pelicula/paranorman-2012-1699022692';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': REFERER
            },
            timeout: 6000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase3() {
    console.log('\n============================================================');
    console.log('>>> 1. VOLCANDO CUERPO Y SCRIPTS DE OPCIÓN 1 (BYSE)');
    console.log('============================================================');

    request(GATEWAY_URL).then(function(res) {
        console.log('[STATUS]: ' + res.status);
        
        // Extraer todos los <script>
        var scripts = res.body.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
        console.log('[SCRIPTS DETECTADOS]: ' + scripts.length);
        scripts.forEach(function(s, i) {
            console.log('\n--- Script #' + (i + 1) + ' ---');
            console.log(s.replace(/<script\b[^>]*>|<\/script>/gi, '').trim());
        });

        // Buscar enlaces o tokens base64 en todo el HTML
        var m3u8OrMp4 = res.body.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi);
        if (m3u8OrMp4) {
            console.log('\n[VIDEOS ENCONTRADOS DIRECTAMENTE]:');
            m3u8OrMp4.forEach(function(u) { console.log('  -> ' + u); });
        }

        console.log('\n============================================================');
        console.log('>>> 2. VOLCANDO CUERPO Y SCRIPTS DE OPCIÓN 2 (OK.RU)');
        console.log('============================================================');

        return request(GATEWAY_OK_URL).then(function(resOk) {
            console.log('[STATUS OK.RU]: ' + resOk.status);
            var scriptsOk = resOk.body.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
            console.log('[SCRIPTS EN OK.RU DETECTADOS]: ' + scriptsOk.length);
            scriptsOk.forEach(function(s, i) {
                console.log('\n--- Script #' + (i + 1) + ' en OK.ru ---');
                console.log(s.replace(/<script\b[^>]*>|<\/script>/gi, '').trim());
            });
        });
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase3();
