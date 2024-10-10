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

		const qs = new URL(request.url).searchParams;
		const year = qs.get('year');
		const month = qs.get('month');
		const day = qs.get('day');

		if (!year || !month || !day) {
			return new Response('Missing year, month or day', { status: 400 });
		}

		const isExperiment = qs.get('experiment') === 'true';
		const time = qs.get('time');

		if (!time) {
			return new Response('Missing time (e.g. 18:00-19:00', { status: 400 });
		}

		const bookedKey = `booked:${year}-${month}-${day}-${time.replaceAll(':', '')}`;

		console.log('Checking this booking ', bookedKey);

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

		let targetTime;

		switch (time) {
			case "18:00-19:00":
				targetTime = '18:00 - 19:00';
				break;
			case "19:00-20:00":
				targetTime = '19:00 - 20:00';
				break;
			case "17:00-18:00":
				targetTime = '17:00 - 18:00';
				break;
			case "09:30-10:30":
				targetTime = '09:30 - 10:30';
				break;
			case "10:30-11:30":
				targetTime = '10:30 - 11:30';
				break;
			default:
				return Response.json('Invalid time', { status: 400 });
		}

		for (const span of spans) {
			const text = await page.evaluate((el) => el.textContent, span);
			if (text.trim() === targetTime) {
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
			if (!isExperiment) {
				await signUpSpan.click();
			}
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
