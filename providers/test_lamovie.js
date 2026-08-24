const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BASE_URL = "https://lamovie.org";

async function findApiRoutesInBundle() {
    console.log("=== BUSCANDO SCRIPTS REALES DE LAMOVIE ===");

    try {
        const pageRes = await fetch(`${BASE_URL}/series/the-last-of-us-2023/`, {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await pageRes.text();

        // 1. Extraer todas las etiquetas <script src="...">
        const scriptSrcs = (html.match(/<script[^>]+src=["']([^"']+)["']/gi) || [])
            .map(s => s.match(/src=["']([^"']+)["']/i)[1])
            .filter(src => src.includes("app") || src.includes("bundle") || src.includes("main") || src.includes(".js"));

        console.log("Scripts encontrados en la web:", scriptSrcs);

        for (let src of scriptSrcs) {
            if (!src.startsWith("http")) {
                src = src.startsWith("/") ? BASE_URL + src : `${BASE_URL}/${src}`;
            }

            console.log(`\nDescargando e inspeccionando: ${src}`);
            const jsRes = await fetch(src, { headers: { "User-Agent": USER_AGENT } });
            const jsCode = await jsRes.text();
            console.log(`Tamaño del script: ${jsCode.length} caracteres`);

            // Buscar cualquier llamada a wp-api o wpf
            const apiCalls = jsCode.match(/(?:wp-api|wp-json|wpf)\/v1\/[a-zA-Z0-9_\-\/]+/g) || [];
            const uniqueCalls = [...new Set(apiCalls)];

            if (uniqueCalls.length > 0) {
                console.log("✅ Rutas de API encontradas dentro de este JS:");
                uniqueCalls.forEach(call => console.log(`  ▶ /${call}`));
            }

            // Buscar funciones de temporadas o episodios
            const episodeFunctions = jsCode.match(/.{0,50}(?:seasons|episodes|temporadas|capitulos).{0,50}/gi) || [];
            if (episodeFunctions.length > 0) {
                console.log(`\nMuestra de referencias a episodios (${episodeFunctions.length} encontradas):`);
                episodeFunctions.slice(0, 5).forEach((f, i) => console.log(`  [${i+1}] ...${f}...`));
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

findApiRoutesInBundle();
