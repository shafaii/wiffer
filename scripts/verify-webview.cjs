// Opt-in local verification only. Launch the packaged app with a temporary WebView2
// debugging port. No synthetic telemetry is injected. Requires Playwright.
const { chromium } = require(process.env.WIFFER_PLAYWRIGHT || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.connectOverCDP(process.env.WIFFER_CDP || 'http://127.0.0.1:9223');
 let page;
 for(let i=0;i<100;i++){ page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://wiffer.local/')); if(page)break; await new Promise(resolve=>setTimeout(resolve,300)); }
 assert.ok(page, 'Packaged local page');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(() => { window.__validation={snapshot:null,traffic:[],acks:[]}; window.chrome.webview.addEventListener('message', e=>{const m=e.data;if(m.type==='snapshot')window.__validation.snapshot=m.snapshot;if(m.type==='traffic'){window.__validation.traffic.push(...m.batch.samples);window.__validation.traffic=window.__validation.traffic.slice(-1204);}if(m.type==='ack'||m.type==='error')window.__validation.acks.push(m);}); });
 await page.waitForFunction(()=>window.__validation.snapshot!==null);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.waitForFunction(()=>window.__validation.snapshot.paused);
 const paused=await page.evaluate(()=>({snapshot:window.__validation.snapshot,last:window.__validation.traffic.at(-1)?.sequence}));
 await page.waitForTimeout(1600);
 const frozen=await page.evaluate(()=>({snapshot:window.__validation.snapshot,last:window.__validation.traffic.at(-1)?.sequence}));
 assert.equal(paused.snapshot.now,frozen.snapshot.now);assert.equal(paused.last,frozen.last);
 assert.deepEqual(paused.snapshot.internet.stats60,frozen.snapshot.internet.stats60);
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 await page.waitForFunction(()=>window.__validation.snapshot.runningSeconds===0);
 assert.equal((await page.evaluate(()=>window.__validation.snapshot.internet.samples.length)),0);
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 await page.waitForFunction(()=>!window.__validation.snapshot.paused && window.__validation.snapshot.internet.samples.length>0);
 await page.getByRole('button',{name:'Historical context 6'}).click();
 assert.equal(await page.locator('.historical-row:not(.table-head)').count(),4);assert.equal(await page.locator('.speedtest').count(),2);
 assert.ok((await page.locator('.history-view').innerText()).includes('292.44'));
 await page.getByRole('button',{name:'Instruments',exact:true}).click();
 await page.getByRole('button',{name:'Measurement settings',exact:true}).click();
 await page.locator('input[placeholder]').fill('1.1.1.1');
 await page.getByRole('button',{name:'Apply settings'}).click();
 await page.getByRole('alert').filter({hasText:'must be different'}).first().waitFor();
 await page.getByRole('button',{name:'Close settings'}).click();
 await page.getByRole('button',{name:'Dismiss error'}).click();
 const before=await page.locator('.instrument-canvas').evaluateAll(es=>es.map(e=>e.getAttribute('_echarts_instance_')));
 await page.getByRole('button',{name:'5 minutes',exact:true}).click();
 await page.getByRole('button',{name:'Expand Gateway RTT',exact:true}).click();
 assert.equal(await page.locator('.instrument-chart.expanded').count(),1);
 const hoverBox=await page.locator('.expanded .instrument-canvas').boundingBox();
 await page.mouse.move(hoverBox.x+hoverBox.width-30,hoverBox.y+hoverBox.height/2);
 await page.waitForTimeout(150);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'60 seconds',exact:true}).click();
 const after=await page.locator('.instrument-canvas').evaluateAll(es=>es.map(e=>e.getAttribute('_echarts_instance_')));
 assert.deepEqual(before,after);assert.equal(new Set(after).size,6);assert.ok(after.every(Boolean));
 fs.mkdirSync('docs/screenshots',{recursive:true}); fs.mkdirSync('artifacts/validation',{recursive:true});
 // Allow a meaningful minute of genuine native samples; no recorded data is replayed.
 await page.waitForFunction(()=>window.__validation.snapshot.runningSeconds>=60,{},{timeout:70000});
 const cdp=await page.context().newCDPSession(page); const layouts=[];const performanceResults=[];
 for(const [width,height] of [[1366,768],[1920,1080]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(1000);
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,chartBottom:document.querySelector('.chart-grid').getBoundingClientRect().bottom,canvasCount:document.querySelectorAll('canvas').length,chartSizes:[...document.querySelectorAll('.instrument-canvas')].map(e=>({width:e.clientWidth,height:e.clientHeight}))}));
  console.log(JSON.stringify({layout}));assert.ok(layout.scrollWidth<=width);assert.ok(layout.chartBottom<height);assert.equal(layout.canvasCount,6);layouts.push(layout);
  await page.screenshot({path:`docs/screenshots/viewport-${width}x${height}.png`, mask: [page.locator('.strip-path'), page.locator('.target'), page.locator('.gateway .chart-foot>span:first-child'), page.locator('.connection-state>span:not(.status-dot)'), page.locator('.connection-inspector summary b')], maskColor: '#273d54'});
  const timing=await page.evaluate(()=>new Promise(resolve=>{const times=[];let first=0,last=0;const hidden=document.hidden;function step(now){if(!first)first=now;if(last)times.push(now-last);last=now;if(now-first<30000){requestAnimationFrame(step);return;}const sorted=[...times].sort((a,b)=>a-b),p50=sorted[Math.floor(sorted.length*.5)],p95=sorted[Math.floor(sorted.length*.95)];resolve({durationMs:now-first,frames:times.length,p50Ms:p50,p95Ms:p95,maxMs:sorted.at(-1),longFrames:times.filter(n=>n>p50*1.5).length,estimatedMissedRefreshes:times.reduce((n,ms)=>n+Math.max(0,Math.round(ms/p50)-1),0),hiddenAtStart:hidden,hiddenAtEnd:document.hidden});}requestAnimationFrame(step);}));
  performanceResults.push({width,height,...timing});console.log(JSON.stringify(performanceResults.at(-1)));
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 const data=await page.evaluate(()=>window.__validation);
 const measured=data.traffic.filter(s=>s.status==='measured');
 const result={checks:['pause freezes probes/traffic/clock/statistics','reset preserves pause and clears probes','resume receives native samples','all six imported summaries retained','duplicate targets rejected','shared windows/expansion preserve six ECharts instances','no horizontal overflow; six charts fit both tested viewports'],layouts,performance:performanceResults,traffic:{count:measured.length,minInterval:Math.min(...measured.map(s=>s.elapsedSeconds)),maxInterval:Math.max(...measured.map(s=>s.elapsedSeconds)),maxDownloadMbps:Math.max(...measured.map(s=>s.downloadMbps)),maxUploadMbps:Math.max(...measured.map(s=>s.uploadMbps))},pageErrors:errors};
 assert.deepEqual(errors,[]);
 fs.writeFileSync('docs/screenshots/validation.json',JSON.stringify(result,null,2)); fs.writeFileSync('artifacts/validation/observed-native.json',JSON.stringify(data,null,2));
 console.log(JSON.stringify(result,null,2));
 // Exiting this client disconnects CDP without issuing Browser.close to WebView2.
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
