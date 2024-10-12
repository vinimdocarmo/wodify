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
		let browser: puppeteer.Browser | null = null;

		try {
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

			console.log(`Booking for ${year}-${month}-${day} at ${time}; experiment: ${isExperiment}`);

			const bookedKey = `booked:${year}-${month}-${day}-${time.replaceAll(':', '')}`;

			// check if today's WOD is already booked
			if ((await env.WOD.get(bookedKey)) === '1') {
				console.log('Already booked ', bookedKey);
				return Response.json({ alreadyBooked: true });
			}

			browser = await puppeteer.launch(env.MYBROWSER, {
				keep_alive: 10000,
			});
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

			const eventInfoSelector = '.event-info-blok__content';
			await page.waitForSelector(eventInfoSelector);

			const spans = await page.$$(eventInfoSelector + ' span');
			let targetSpan = null;

			let targetTime;

			switch (time) {
				case '18:00-19:00':
					targetTime = '18:00 - 19:00';
					break;
				case '19:00-20:00':
					targetTime = '19:00 - 20:00';
					break;
				case '17:00-18:00':
					targetTime = '17:00 - 18:00';
					break;
				case '09:30-10:30':
					targetTime = '09:30 - 10:30';
					break;
				case '10:30-11:30':
					targetTime = '10:30 - 11:30';
					break;
				default:
					return new Response('Invalid time', { status: 400 });
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
				if (text.trim() === 'Aanmelden') {
					signUpSpan = span;
					break;
				}
			}

			if (signUpSpan) {
				if (!isExperiment) {
					await signUpSpan.click();
					// mark today's WOD as booked
					await env.WOD.put(bookedKey, '1');
				}

				await page.waitForSelector('.alert.success');

				return Response.json({ ok: 'class booked!' });
			} else {
				return new Response('Sign up button not found', { status: 500 });
			}
		} catch (e) {
			const m = e ? (e as any).message : 'Unknown error';
			console.error('Error: ', m);

			return new Response('Internal server error', { status: 500 });
		} finally {
			if (browser) {
				await browser.close();
			}
		}
	},
} satisfies ExportedHandler<Env>;
