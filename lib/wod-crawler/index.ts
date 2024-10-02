import puppeteer, { BrowserWorker } from '@cloudflare/puppeteer';

interface Env {
	MYBROWSER: BrowserWorker;
	WOD: KVNamespace;
	EMAIL: string;
	PASS: string;
	TOKEN: string;
}

export default {
	async fetch(request, env): Promise<Response> {
		const auth = request.headers.get('Authorization')?.split('Bearer ')[1];
		if (auth !== env.TOKEN) {
			return new Response('Unauthorized', { status: 401 });
		}

		const wodContent = await crawlWodContent(env);

		return Response.json({ ok: true, wod: wodContent });
	},
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		await crawlWodContent(env);
	},
} satisfies ExportedHandler<Env>;

async function crawlWodContent(env: Env): Promise<string> {
	// get year, month and day from today's date
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const day = today.getDate();

	const wodKey = `wod:${year}-${month}-${day}`;
	const wodContentKV = await env.WOD.get(wodKey);

	// check if today's WOD is already stored
	if (wodContentKV) {
		return wodContentKV;
	}

	const browser = await puppeteer.launch(env.MYBROWSER, { keep_alive: 10000 });
	const page = await browser.newPage();
	await page.goto('https://creativesportscompany.sportbitapp.nl/web/en/login');

	await page.waitForSelector('.login__button');
	await page.click('.login__button');

	const usernameInput = '[formcontrolname="username"]';
	await page.waitForSelector(usernameInput);
	const passwordInput = '[formcontrolname="password"]';
	await page.waitForSelector(passwordInput);
	const signInBtn = 'button[type="submit"]';
	await page.waitForSelector(signInBtn);

	await page.type(usernameInput, env.EMAIL);
	await page.type(passwordInput, env.PASS);

	await page.click(signInBtn);

	const calendarContentSelector = '.calendar-dv__content';
	await page.waitForSelector(calendarContentSelector);

	const spans = await page.$$(calendarContentSelector + ' span');
	let targetSpan = null;

	for (const span of spans) {
		const text = await page.evaluate((el) => el.textContent, span);
		if (text.trim() === '17:00 - 18:00') {
			targetSpan = span;
			break;
		}
	}

	if (targetSpan) {
		await targetSpan.click();
	} else {
		throw new Error('class not found');
	}

	const wodContentSelector = '.workout-card__content';
	await page.waitForSelector(wodContentSelector);

	const wodContentEl = await page.$(wodContentSelector);
	let wodContent = await page.evaluate((el) => el.innerHTML, wodContentEl) ?? "";

	wodContent = wodContent.replace(/<br>/g, '\n');

	if (wodContent) {
		await env.WOD.put(wodKey, wodContent);
	}

	await browser.close();

	return wodContent;
}
