export async function onRequest(context) {
  // get year, month and day from today's date
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const day = today.getDate();

	const wodKey = `wod:${year}-${month}-${day}`;
	const wodContent = await context.env.WOD.get(wodKey) ?? "No WOD found";

  return new Response(wodContent, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
