/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 16 - Despeje Final Byse)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var PLAYBACK_URL = 'https://byseraguci.com/api/videos/tiumae2gw611/playback';
var FRAME_URL = 'https://n1mwq.org/s71n4/tiumae2gw611';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url, options) {
    options = options || {};
    return new Promise(function(resolve, reject) {
        var parsed = new URL(url);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: options.method || 'GET',
            headers: Object.assign({
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/html, */*',
                'Referer': 'https://byseraguci.com/e/tiumae2gw611/P4N0RM-18LA.mp4'
            }, options.headers || {}),
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
        if (options.body) req.write(options.body);
        req.end();
    });
}

function runAuditPhase16() {
    console.log('\n============================================================');
    console.log('>>> 1. PROBANDO POST A /playback');
    console.log('============================================================');

    request(PLAYBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    }).then(function(res) {
        console.log('[POST /playback STATUS]: ' + res.status);
        console.log('Body: ' + res.body.substring(0, 300));

        console.log('\n============================================================');
        console.log('>>> 2. INSPECCIONANDO embed_frame_url: ' + FRAME_URL);
        console.log('============================================================');

        return request(FRAME_URL, {
            headers: { 'Referer': 'https://byseraguci.com/' }
        });
    }).then(function(frameRes) {
        console.log('[FRAME STATUS]: ' + frameRes.status);
        var m3u8 = frameRes.body.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi);
        if (m3u8) {
            console.log('>>> ¡STREAM HLS ENCONTRADO EN EL FRAME!:\n', m3u8);
        } else {
            var mp4 = frameRes.body.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi);
            if (mp4) {
                console.log('>>> ¡STREAM MP4 ENCONTRADO EN EL FRAME!:\n', mp4);
            } else {
                console.log('Preview del Frame:\n' + frameRes.body.substring(0, 400).replace(/\s+/g, ' '));
            }
        }
    }).catch(function(err) {
        console.log('Error:', err.message);
    });
}

runAuditPhase16();
