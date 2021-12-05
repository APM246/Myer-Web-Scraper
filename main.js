import cheerio from 'cheerio'; // Uses JQuery API to examine HTML
import puppeteer from 'puppeteer'; // in order to run javascript of client-side rendered page
import twilio from 'twilio'; // SMS API
import fs from 'fs'; // write errors to logs

const MYER_URL = 'https://www.myer.com.au/p/';

// SLUGs of various pants
const URLs = ['cooper-skinny-suit-trouser-379662130','hemsworth-skinny-suit-trouser-424873540',
'kenji-formals-affleck-skinny-suit-trouser', 'kenji-formals-elba-skinny-suit-trouser'];

// Time delay between web scraping checks to avoid detection or rate limiting issues
const NUM_MINUTES = 2;
const TIME_DELAY = NUM_MINUTES * 60 * 1000;

// Twilio API configuration details
const accountSid = process.env.accountSid;
const authToken = process.env.authToken;
const senderNumber = process.env.senderNumber;
const recipientNumber = process.env.recipientNumber;
const client = twilio(accountSid, authToken);

async function check(url) {
	try {
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await page.setDefaultNavigationTimeout(0);
		await page.goto(MYER_URL + url);
		const content = await page.content();

		const $ = cheerio.load(content);
		await browser.close();
		const result = $('#size-28').attr("disabled");

		// send email or SMS to alert me
		if (result == undefined) {
			// Get current date and time
			const timestamp = new Date().toUTCString();

			const message = await client.messages.create({
				to: recipientNumber,
				from: senderNumber, 
				body: `${timestamp}, in-stock: ${url}`
			});
			console.log(message.sid);
			
			const index = URLs.indexOf(url);
			URLs.splice(index, 1);
		}
	}

	catch (e) {
		console.log(e);
		const errorMessage = await client.messages.create({
			to: recipientNumber,
			from: senderNumber, 
			body: 'Error occurred, check logs.'
		});
		
		await fs.writeFile('error.log', e.toString(), {'flag': 'a'}, (err) => {
			if (err) return console.error(err);
		});
		process.exit(0);
	}
}

// start script
while (true) {
	// loop backwards to prevent concurrent modification error if any
	for (let i = URLs.length - 1; i >= 0; i--) {
		const url = URLs[i];
		await check(url); // check each clothing item to see if in stock
	}

	// exit program and send final message
	if (URLs.length == 0) {
		const exitMessage = await client.messages.create({
			to: recipientNumber,
			from: senderNumber, 
			body: 'All pants have been re-stocked. Terminating script.'
		});
		console.log(exitMessage.sid);
		process.exit(0);
	}

	// wait TIME_DELAY in milliseconds before checking again
	await new Promise(resolve => setTimeout(resolve, TIME_DELAY));
}
