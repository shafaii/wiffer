const {chromium}=require(process.env.WIFFER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'), assert=require('node:assert/strict');
const stats=a=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return {count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};
(async()=>{
 const browser=await chromium.connectOverCDP(process.env.WIFFER_CDP||'http://127.0.0.1:9223');
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://wiffer.local/'));assert.ok(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{window.__wifiCheck={snapshot:null};window.chrome.webview.addEventListener('message',e=>{if(e.data.type==='snapshot')window.__wifiCheck.snapshot=e.data.snapshot;});});
 await page.waitForFunction(()=>window.__wifiCheck.snapshot);
 await page.getByRole('button',{name:'Wi-Fi Lab',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.wifi-lab')?.dataset.state==='Stable'||document.querySelector('.wifi-lab')?.classList.contains('lab-live'));
 const ids=await page.locator('.lab-chart-canvas').evaluateAll(es=>es.map(e=>e.getAttribute('_echarts_instance_')));assert.equal(ids.length,4);assert.ok(ids.every(Boolean));
 const cdp=await page.context().newCDPSession(page), results=[];
 for(const [width,height]of [[1366,768],[1920,1080]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(500);
  const metrics=await page.evaluate(()=>new Promise(resolve=>{
   const frames=[],cadence=[],delivery=[];let previous=0,start=0,lastObserved=null,nativeObservations=0;let snapshots=0;const native={rssi:true,quality:true,band:true,channel:true,rates:true,association:true};
   const onMessage=e=>{if(e.data.type!=='snapshot')return;const s=e.data.snapshot;snapshots++;const at=Date.parse(s.network.observedAt);if(at!==lastObserved){if(lastObserved!==null)cadence.push(at-lastObserved);lastObserved=at;nativeObservations++;delivery.push(Date.now()-at);}const w=s.network.details?.wifi;native.rssi&&=w?.rssiDbm!==null;native.quality&&=w?.signalQuality!==null;native.band&&=!!w?.band;native.channel&&=!!w?.channel;native.rates&&=w?.rxLinkMbps!=null&&w?.txLinkMbps!=null;native.association&&=!!w?.bssid&&!!w?.radioType&&!!w?.authentication&&!!w?.cipher&&!!w?.mac;};
   window.chrome.webview.addEventListener('message',onMessage);
   function tick(t){if(!start)start=t;if(previous)frames.push(t-previous);previous=t;if(t-start<30000){requestAnimationFrame(tick);return;}window.chrome.webview.removeEventListener('message',onMessage);resolve({durationMs:t-start,frames,cadence,delivery,nativeObservations,snapshots,availableThroughout:native,hidden:document.hidden});}requestAnimationFrame(tick);
  }));
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollY,scrollWidth:document.documentElement.scrollWidth,heroBottom:document.querySelector('.lab-hero').getBoundingClientRect().bottom,chartBottom:document.querySelector('.lab-charts').getBoundingClientRect().bottom,stamps:[...document.querySelectorAll('.lab-hero')].map(e=>e.dataset.observedAt),visibleState:document.querySelector('.wifi-lab').dataset.state}));
  assert.equal(layout.scrollY,0);assert.ok(layout.scrollWidth<=width);assert.ok(layout.chartBottom<=height);assert.equal(layout.stamps.length,1);assert.ok(layout.stamps[0]);
  const numerical=await page.evaluate(()=>{const s=window.__wifiCheck.snapshot,w=s.network.details?.wifi;return {sameTimestamp:document.querySelector('.lab-hero').dataset.observedAt===s.network.observedAt,rssi:document.querySelector('.wifi-rssi-number').firstChild.textContent===String(w.rssiDbm),quality:document.querySelector('.wifi-quality-number').firstChild.textContent===String(w.signalQuality)};});
  assert.ok(numerical.sameTimestamp&&numerical.rssi&&numerical.quality);
  await page.screenshot({path:`docs/screenshots/m081-wifi-lab-${width}x${height}.png`,mask:[page.locator('.strip-path'),page.locator('.connection-state>span:not(.status-dot)')],maskColor:'#273d54'});
  const {frames,cadence,delivery,...rest}=metrics;
  const result={width,height,...rest,rafMs:stats(frames),observedCadenceMs:stats(cadence),observationToSnapshotJsWallMs:stats(delivery),layout,numerical};results.push(result);console.log(JSON.stringify(result));
 }
 await page.getByRole('button',{name:'5 minutes',exact:true}).click();await page.getByRole('button',{name:'60 seconds',exact:true}).click();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.wifi-lab').dataset.state==='Paused');
 const paused=await page.locator('.lab-hero').first().getAttribute('data-observed-at');await page.waitForTimeout(1500);assert.equal(paused,await page.locator('.lab-hero').first().getAttribute('data-observed-at'));
 assert.equal(await page.locator('.wifi-signal').first().evaluate(e=>getComputedStyle(e).opacity),'0');
 await page.screenshot({path:'docs/screenshots/m081-paused.png',mask:[page.locator('.strip-path'),page.locator('.connection-state>span:not(.status-dot)')],maskColor:'#273d54'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.wifi-lab').classList.contains('lab-live'));
 await page.waitForTimeout(100);
 const motion=await page.locator('.wifi-lab').evaluate(e=>({r:Number(e.style.getPropertyValue('--field')),q:Number(e.style.getPropertyValue('--link')),w:window.__wifiCheck.snapshot.network.details.wifi}));
 assert.ok(Math.abs(motion.r-Math.max(0,Math.min(1,(motion.w.rssiDbm+100)/60)))<.0001);assert.equal(motion.q,motion.w.signalQuality/100);
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.deepEqual(ids,await page.locator('.lab-chart-canvas').evaluateAll(es=>es.map(e=>e.getAttribute('_echarts_instance_'))));
 await page.locator('.lab-inspector summary').click();assert.equal(await page.locator('.lab-inspector dd').count(),17);await page.locator('.lab-inspector summary').click();
 assert.deepEqual(errors,[]);
 fs.writeFileSync('docs/screenshots/m081-validation.json',JSON.stringify({checks:['real native bridge, no injected telemetry','single hero timestamp and exact native numbers','4 stable charts across both viewports, windows and pause','native observations freeze during pause; inactive signal hidden','reduced motion snaps to measured targets','17 technical inspector fields','no page errors or horizontal overflow'],results,pageErrors:errors,limitations:'rAF opportunities are not GPU presentation; native and JS timing is same-PC wall-clock estimate. Debugger attached. No physical disconnect, roaming, MLO or privacy-policy changes performed.'},null,2));
 await cdp.send('Emulation.clearDeviceMetricsOverride');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
