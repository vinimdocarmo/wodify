export async function onRequest(context) {
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const day = today.getDate();

	const wodKey = `wod:${year}-${month}-${day}`;
	let wodContent: string = (await context.env.WOD.get(wodKey)) ?? "No WOD found";

    wodContent = wodContent.replaceAll("\n", "<br><br>");

	return new Response(wodContent, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
