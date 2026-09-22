/**
 * Script de diagnóstico HTTP y verificación de WAF / Cloudflare
 * Uso: node inspect_endpoint.js "https://ejemplo.com/ruta-o-api"
 */

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("[-] Debes proporcionar una URL como argumento.");
  console.log("    Ejemplo: node inspect_endpoint.js https://ejemplo.com");
  process.exit(1);
}

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Connection": "keep-alive"
};

console.log(`[*] Conectando a: ${targetUrl}\n`);

fetch(targetUrl, { method: "GET", headers: headers, redirect: "follow" })
  .then(function(res) {
    const status = res.status;
    const contentType = res.headers.get("content-type") || "";
    const serverHeader = res.headers.get("server") || "";
    const cfRay = res.headers.get("cf-ray");
    const cfMitigated = res.headers.get("cf-mitigated");

    console.log("=== DIAGNÓSTICO DE RESPUESTA HTTP ===");
    console.log(`- Código de estado: ${status} (${res.statusText})`);
    console.log(`- Content-Type:     ${contentType}`);
    console.log(`- Servidor:         ${serverHeader}`);
    console.log(`- CF-Ray ID:        ${cfRay ? cfRay : "No presente (no es Cloudflare directo)"}`);
    console.log(`- CF-Mitigated:     ${cfMitigated ? cfMitigated : "No"}`);
    console.log("-------------------------------------");

    return res.text().then(function(body) {
      // Detección de patrones de desafío Cloudflare
      const isCfChallenge = 
        status === 403 || 
        status === 503 ||
        body.includes("cf-browser-verification") ||
        body.includes("challenge-platform") ||
        body.includes("Checking your browser") ||
        body.includes("Just a moment...");

      if (isCfChallenge) {
        console.log("[!] RESULTADO: DESAFÍO ACTIVO (Cloudflare / WAF)");
        console.log("    El sitio requiere resolución de retos en navegador.");
        console.log("    -> Incompatible con el runtime ligero de Hermes.\n");
      } else if (status >= 200 && status < 300) {
        console.log("[+] RESULTADO: ACCESIBLE (200 OK)");
        console.log("    El endpoint responde sin bloqueo interactivo.");
        console.log(`    Tamaño del payload: ${body.length} caracteres.`);

        // Muestra si la respuesta es JSON o HTML
        if (contentType.includes("application/json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
          console.log("    -> Tipo detectado: JSON / API");
        } else {
          console.log("    -> Tipo detectado: Documento HTML / Texto");
        }
        console.log("\n--- Primeros 300 caracteres del cuerpo ---");
        console.log(body.substring(0, 300));
        console.log("------------------------------------------");
      } else {
        console.log(`[?] RESULTADO: CÓDIGO INESPERADO (${status})`);
        console.log(`    Verifica si la ruta requiere parámetros o cabeceras adicionales.`);
      }
    });
  })
  .catch(function(err) {
    console.error("[-] Error en la conexión:");
    console.error(err.message);
  });
