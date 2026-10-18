import indexHtml from "../public/index.html?raw";

export async function GET() {
  return new Response(indexHtml, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
