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

		// get year, month and day from today's date
		const today = new Date();
		const year = today.getFullYear();
		const month = today.getMonth() + 1;
		const day = today.getDate();
		const time = '1800-1900';

		const bookedKey = `booked:${year}-${month}-${day}-${time}`;

		// check if today's WOD is already booked
		if ((await env.WOD.get(bookedKey)) === '1') {
			return Response.json({ alreadyBooked: true });
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
			if (text.trim() === '18:00 - 19:00') {
				targetSpan = span;
				break;
			}
		}

		if (targetSpan) {
			await targetSpan.click();
		} else {
			return Response.json({ ok: 'class not found' });
		}

		const spansInParent = await page.$$('.event-info-blok__content span');
		let signUpSpan = null;

		for (const span of spansInParent) {
			const text = await page.evaluate((el) => el.textContent, span);
			if (text.trim() === 'Sign up') {
				signUpSpan = span;
				break;
			}
		}

		if (signUpSpan) {
			await signUpSpan.click();
			await page.waitForSelector('.alert.success');
			await browser.close();

			// mark today's WOD as booked
			await env.WOD.put(bookedKey, '1');

			return Response.json({ ok: 'class booked!' });
		} else {
			await browser.close();
			return Response.json({ ok: 'Sign up button not found' });
		}
	},
} satisfies ExportedHandler<Env>;
