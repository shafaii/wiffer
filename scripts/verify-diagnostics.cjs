const {chromium}=require(process.env.WIFFER_PLAYWRIGHT||'playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');let page;for(let i=0;i<60;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://wiffer.local/'));if(page)break;await new Promise(r=>setTimeout(r,250));}
await page.getByRole('button',{name:'Test Speed',exact:false}).waitFor();
await page.getByRole('button',{name:'Test Speed',exact:false}).click();
await page.locator('.speed-dialog').screenshot({path:'docs/screenshots/quick-speed-test.png'});
await page.getByRole('button',{name:'Close speed test'}).click();
await page.locator('.measurement-details summary').click();await page.locator('.telemetry-diagnostics').scrollIntoViewIfNeeded();await page.waitForTimeout(2000);
const diagnostics=await page.locator('.telemetry-diagnostics').innerText();assert.ok(diagnostics.includes('Batch / sample gaps'));
fs.writeFileSync('artifacts/validation/diagnostics.txt',diagnostics);
await page.locator('.telemetry-diagnostics').screenshot({path:'docs/screenshots/telemetry-diagnostics.png'});
await page.locator('.measurement-details summary').click();
await page.locator('.connection-inspector summary').click();assert.equal(await page.locator('.connection-inspector dd').count(),12);await page.locator('.connection-inspector summary').click();
await page.evaluate(()=>scrollTo(0,0));console.log(diagnostics);process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
