// Isolated UI fixtures only: never loaded by the packaged app or native bridge.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('../ui/node_modules/esbuild');
const {chromium}=require(process.env.WIFFER_PLAYWRIGHT||'playwright');
(async()=>{
 const out=path.resolve('artifacts/validation/m083-fixtures');fs.mkdirSync(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {WifiLab} from './src/WifiLab';import {snapshotSchema} from './src/contract';import './src/styles.css';
const metrics={sent:0,successful:0,timeouts:0,errors:0,lossPercent:null,min:null,average:null,max:null,median:null,p95:null,variation:null};
function snapshot(state,rssi,quality){const now=new Date().toISOString();return snapshotSchema.parse({now,sessionStarted:now,runningSeconds:0,paused:state==='Paused',network:{connected:state!=='Disconnected',adapterId:'fixture',adapterName:'UI fixture',gateway:null,adapters:[],error:null,observedAt:now,details:{type:'Wi-Fi',operationalState:'Up',selection:'Isolated UI fixture',bytesReceived:null,bytesSent:null,receiveErrors:null,sendErrors:null,receiveDiscards:null,sendDiscards:null,counterError:null,wifi:{ssid:null,band:'5 GHz',channel:36,rssiDbm:rssi,signalQuality:quality,rxLinkMbps:null,txLinkMbps:null,unavailableReason:null,state:state==='Reconnecting'?'associating':state==='Disconnected'?'disconnected':'connected'}}},settings:{gatewayOverride:null,internetTarget:'1.1.1.1',timeoutMs:2500},gateway:{id:'gateway',target:null,samples:[],stats60:metrics,stats300:metrics},internet:{id:'internet',target:'1.1.1.1',samples:[],stats60:metrics,stats300:metrics}})}
function Fixture(){const [data,set]=React.useState({state:'Stable',rssi:-60,quality:80});window.setFixture=(state,rssi,quality)=>set({state,rssi,quality});return <><p style={{padding:12,color:'#e0c6a4'}}>ISOLATED UI TEST FIXTURE — NOT LIVE TELEMETRY</p><WifiLab snapshot={snapshot(data.state,data.rssi,data.quality)} stale={data.state==='Stale'}/></>};createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:path.resolve('ui'),sourcefile:'fixture.tsx',loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(out,'fixture.js')});
 const server=http.createServer((req,res)=>{const file=req.url==='/fixture.js'?'fixture.js':req.url==='/fixture.css'?'fixture.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(out,file)):'<!doctype html><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');});
 await new Promise(r=>server.listen(9224,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {const page=await browser.newPage({viewport:{width:1366,height:768}});await page.goto('http://127.0.0.1:9224');await page.waitForSelector('.wifi-lab');await page.emulateMedia({reducedMotion:'reduce'});

 const checks=[];
 for(const [state,rssi,quality] of [['Stable',-60,80],['Degraded',-83,25],['Reconnecting',null,null],['Disconnected',null,null],['Stale',-60,80],['Unavailable',null,null],['Paused',-60,80],['Stable',null,80],['Stable',-60,null]]) {
   await page.evaluate(([s,r,q])=>window.setFixture(s,r,q),[state,rssi,quality]);await page.waitForTimeout(80);
   const result=await page.locator('.wifi-lab').evaluate(e=>({state:e.dataset.state,quality:e.querySelector('.surface-quality').firstChild.textContent,rssi:e.querySelector('.surface-rssi').firstChild.textContent.trim(),transform:e.querySelector('.surface-trace').getAttribute('transform')}));
   assert.equal(result.state,state);const active=['Stable','Degraded'].includes(state);assert.equal(result.quality,active&&quality!==null?String(quality):'—');assert.equal(result.rssi,active&&rssi!==null?String(rssi):'—');assert.equal(result.transform,null);checks.push({state,rssi,quality,result});
 }
 await page.evaluate(()=>window.setFixture('Stable',-60,80));await page.waitForTimeout(100);
 // Emulated pointer events exercise the pinch handlers; this is not physical touchscreen evidence.
 await page.locator('.live-surface-plot').evaluate(el=>{el.setPointerCapture=()=>{};el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:400,bubbles:true}));el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:2,clientX:700,bubbles:true}));el.dispatchEvent(new PointerEvent('pointermove',{pointerId:2,clientX:550,bubbles:true}));});
 await page.waitForTimeout(100);assert.ok(Number(await page.locator('.live-surface').getAttribute('data-seconds'))>60);
 await page.locator('.live-surface-plot').dispatchEvent('pointercancel',{pointerId:1});await page.getByRole('button',{name:'Return to Live',exact:true}).click();
 fs.writeFileSync('docs/screenshots/m083-state-validation.json',JSON.stringify({checks,pinch:'Emulated two-pointer pinch zoom passed',scope:'Isolated UI fixtures, not live telemetry or hardware tests'},null,2));console.log('PASS: nine state/missing-field fixtures, reduced motion, emulated pinch');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
