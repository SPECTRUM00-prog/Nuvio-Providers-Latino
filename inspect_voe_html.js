// inspect_voe_html.js
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function run() {
    const url = "https://voe.sx/e/j6koo1mpucye";
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url } });
        console.log("Status:", res.status);
        const html = await res.text();
        console.log("HTML length:", html.length);
        console.log("HTML:\n", html);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
