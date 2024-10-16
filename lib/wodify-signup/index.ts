import puppeteer, { BrowserWorker } from '@cloudflare/puppeteer';

interface Env {
	MYBROWSER: BrowserWorker;
	WOD: KVNamespace;
	EMAIL_VINI: string;
	EMAIL_INI: string;
	PASS_VINI: string;
	PASS_INI: string;
	TOKEN_VINI: string;
	TOKEN_INI: string;
}

export default {
	async fetch(request, env): Promise<Response> {
		let browser: puppeteer.Browser | null = null;
		const creds = {
			vini: {
				email: env.EMAIL_VINI,
				pass: env.PASS_VINI,
				token: env.TOKEN_VINI,
			},
			ini: {
				email: env.EMAIL_INI,
				pass: env.PASS_INI,
				token: env.TOKEN_INI,
			},
		};

		try {
			const auth = request.headers.get('Authorization')?.split('Bearer ')[1];
			let user: 'vini' | 'ini';

			if (auth === creds.vini.token) {
				user = 'vini';
			} else if (auth === creds.ini.token) {
				user = 'ini';
			} else {
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

			const bookedKey = `booked:${user}:${year}-${month}-${day}-${time.replaceAll(':', '')}`;

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

			await page.waitForSelector('.login__button', { timeout: 5000 });
			await page.click('.login__button');

			const usernameInput = '[formcontrolname="username"]';
			await page.waitForSelector(usernameInput);
			const passwordInput = '[formcontrolname="password"]';
			await page.waitForSelector(passwordInput);
			const signInBtn = 'button[type="submit"]';
			await page.waitForSelector(signInBtn);

			let email, pass: string;

			if (user === 'vini') {
				email = creds.vini.email;
				pass = creds.vini.pass;
			} else if (user === 'ini') {
				email = creds.ini.email;
				pass = creds.ini.pass;
			}

			await page.type(usernameInput, email!);
			await page.type(passwordInput, pass!);

			await page.click(signInBtn);

			const eventInfoSelector = '.calendar-dv__card-wrapper';
			await page.waitForSelector(eventInfoSelector, { timeout: 5000 });

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

			const blockInfoSelector = '.event-info-blok__content';
			await page.waitForSelector(blockInfoSelector, { timeout: 5000 });

			const spansInParent = await page.$$(`${blockInfoSelector} span`);
			let signUpSpan = null;

			const spanTexts: string[] = [];

			for (const span of spansInParent) {
				const text = await page.evaluate((el) => el.textContent, span);
				spanTexts.push(text.trim());
				if (text.trim().toLowerCase() === 'sign up') {
					signUpSpan = span;
					break;
				}
			}

			if (signUpSpan) {
				if (!isExperiment) {
					await signUpSpan.click();
					await page.waitForSelector('.alert.success', { timeout: 5000 });
					// mark today's WOD as booked
					await env.WOD.put(bookedKey, '1', { expirationTtl: 60 * 60 * 24 /** expire after 24 hours */ });
				}

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
