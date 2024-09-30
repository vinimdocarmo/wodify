import puppeteer, { BrowserWorker } from '@cloudflare/puppeteer';

interface Env {
	MYBROWSER: BrowserWorker;
	EMAIL: string;
	PASS: string;
}

export default {
	async fetch(request, env): Promise<Response> {
		const auth = request.headers.get('Authorization')?.split('Bearer ')[1];
		if (auth !== "vinimdocarmo@gmail.com") {
			return new Response('Unauthorized', { status: 401 });
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

		const parentSelector = '.koptekst-icoon-reset';
		await page.waitForSelector(parentSelector);

		const alertSuccess = await page.$('.alert.success');

		if (alertSuccess) {
			console.log('class already booked!');
			await browser.close();
			return Response.json({ ok: 'class already booked!' });
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
			return Response.json({ ok: 'class booked!' });
		} else {
			await browser.close();
			return Response.json({ ok: 'Sign up button not found' });
		}
	},
} satisfies ExportedHandler<Env>;
