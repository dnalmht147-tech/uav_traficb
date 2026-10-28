'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const classes=[{name:'Người',color:'#d9a65a',icon:'♙'},{name:'Ô tô',color:'#469cda',icon:'▰'},{name:'Xe máy',color:'#3cbe98',icon:'♧'},{name:'Xe buýt',color:'#a686d3',icon:'▤'},{name:'Xe tải',color:'#e68c67',icon:'▣'}];
const results=[[.080,.911,.959,.812,.542],[.642,.992,.991,.978,.926],[.564,.993,.996,.963,.839],[.453,.975,.979,.946,.908],[.274,.981,.994,.946,.917]];
let selected=new Set([0,1,2,3,4]),threshold=.5,running=true,showBoxes=true,mode='demo',simTime=0,altitude=15,previous=0,objectURL=null,toastTimer;
// Two perpendicular roads; vehicles recycle only beyond the complete scene.
const ROAD_START=-2600,ROAD_END=2600,ROAD_LENGTH=ROAD_END-ROAD_START;
const lanes=[
 {center:-112,speed:74,direction:1,axis:'v'}, {center:-38,speed:68,direction:1,axis:'v'},
 {center:38,speed:68,direction:-1,axis:'v'}, {center:112,speed:74,direction:-1,axis:'v'},
 {center:214,speed:0,direction:-1,axis:'v'},
 {center:38,speed:68,direction:1,axis:'h'}, {center:112,speed:74,direction:1,axis:'h'},
 {center:-38,speed:68,direction:-1,axis:'h'}, {center:-112,speed:74,direction:-1,axis:'h'}
];
const objects=lanes.flatMap((lane,index)=>Array.from({length:index===4?4:12},(_,rank)=>{
 const n=index===4?4:12,id=index*12+rank+1;
 return{id:`D${String(id).padStart(3,'0')}`,cls:index===4?0:rank%7===0?3:rank%5===0?4:rank%3===0?2:1,
 confidence:.85+(id%14)/100,lane:index,q:index===4?ROAD_START+(rank+.24)*ROAD_LENGTH/n:(rank<6?-2500+rank*380:400+(rank-6)*380)+index*6};
}));
function laneGreen(lane){const phase=simTime%40;return lane.axis==='v'?phase<12:phase>=20&&phase<32}
function advanceTraffic(dt){
 const proposed=new Map();
 lanes.forEach((lane,index)=>{
  const members=objects.filter(o=>o.lane===index).sort((a,b)=>a.q-b.q);
  members.forEach((o,i)=>{
   const front=members[(i+1)%members.length],gap=(front.q-o.q+ROAD_LENGTH)%ROAD_LENGTH;
   const clearance=(vehicleSize(o).h+vehicleSize(front).h)/2+30;
   let move=Math.min(lane.speed*dt,Math.max(0,gap-clearance));
   const stop=-210-vehicleSize(o).h/2;
   if(!laneGreen(lane)&&o.q<=stop+.001)move=Math.min(move,Math.max(0,stop-o.q));
   let q=o.q+move;if(q>ROAD_END)q-=ROAD_LENGTH;proposed.set(o,q);
  });
 });
 proposed.forEach((q,o)=>o.q=q);
}
let livePacket=null,liveFrame=null,liveFresh=false;
const visible=()=>mode==='demo'?objects.filter(o=>selected.has(o.cls)&&o.confidence>=threshold&&inCamera(o)):mode==='live'&&liveFresh&&livePacket?livePacket.detections.filter(o=>selected.has(o.cls)&&o.confidence>=threshold):[];
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3600)}
function setView(view){if(!['monitor','results','project'].includes(view))view='monitor';$$('.view').forEach(el=>el.classList.toggle('active',el.id===view));$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#crumb').textContent={monitor:'Giám sát trực tiếp',results:'Kết quả mô hình',project:'Giới thiệu dự án'}[view];if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);window.scrollTo({top:0,behavior:'instant'})}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));setView(location.hash.slice(1)||'monitor');
classes.forEach((c,i)=>{const b=document.createElement('button');b.className='active';b.style.setProperty('--color',c.color);b.innerHTML=`<span class="class-dot"></span>${c.name}`;b.setAttribute('aria-pressed','true');b.onclick=()=>{selected.has(i)?selected.delete(i):selected.add(i);update()};$('#filters').append(b)});
$('#all-filter').onclick=()=>{selected=selected.size===5?new Set():new Set([0,1,2,3,4]);update()};
$('#confidence').oninput=e=>{threshold=Number(e.target.value)/100;$('#conf-value').textContent=e.target.value+'%';update()};
function update(){const list=visible(),counts=classes.map((_,i)=>list.filter(o=>o.cls===i).length),total=list.length;$('#total').textContent=mode==='demo'||(mode==='live'&&liveFresh)?total:'—';$('#list-count').textContent=total;$('#donut-total').textContent=mode==='demo'||(mode==='live'&&liveFresh)?total:'—';$$('#filters button').forEach((b,i)=>{b.classList.toggle('active',selected.has(i));b.setAttribute('aria-pressed',String(selected.has(i)))});$('#all-filter').textContent=selected.size===5?'Bỏ chọn tất cả':'Chọn tất cả';$('#detection-list').innerHTML=list.length?list.map(o=>{const c=classes[o.cls];return `<div class="detection-row"><span class="vehicle-icon" style="--color:${c.color}">${c.icon}</span><div>${c.name}<small>${o.id} · ${mode==='live'?'ID khung hình':'đối tượng minh họa'}</small></div><b>${Math.round(o.confidence*100)}%</b></div>`}).join(''):`<div class="empty">${mode==='demo'?'Không có đối tượng phù hợp với bộ lọc.':mode==='live'?(liveFresh?'Không có đối tượng phù hợp với bộ lọc.':'Đang chờ ảnh mới từ backend. Không dùng số liệu demo.'):'Tệp đang được xem trước. Chưa có mô hình nhận diện hoặc dữ liệu đối tượng.'}</div>`;let acc=0;const gradient=counts.map((n,i)=>{const start=acc;acc+=total?n/total*100:0;return `${classes[i].color} ${start}% ${acc}%`}).join(',');$('#donut').style.background=total?`conic-gradient(${gradient})`:'#edf2ee';$('#legend').innerHTML=classes.map((c,i)=>`<div class="legend-row"><span class="class-dot" style="--color:${c.color}"></span>${c.name}<strong>${counts[i]}</strong><small>${total?Math.round(counts[i]/total*100):0}%</small></div>`).join('');if(mode==='live'&&typeof drawLive==='function')drawLive()}
$('#results-body').innerHTML=classes.map((c,i)=>`<tr><td><span class="class-dot" style="--color:${c.color};margin-right:8px"></span>${c.name}</td>${results[i].map(n=>`<td>${n.toFixed(3).replace('.',',')}</td>`).join('')}</tr>`).join('');
$('#connection').onclick=()=>$('#connect-dialog').showModal();$('#got-it').onclick=()=>$('#connect-dialog').close();
$('#pause').onclick=()=>{if(mode!=='demo')return;running=!running;$('#pause').textContent=running?'Ⅱ Tạm dừng':'▶ Tiếp tục';$('#scene-status').textContent=running?'● DEMO':'Ⅱ TẠM DỪNG'};
$('#boxes').onclick=()=>{showBoxes=!showBoxes;$('#boxes').setAttribute('aria-pressed',String(showBoxes))};
function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
$('#export').onclick=()=>{
 if(mode==='file'||(mode==='live'&&!liveFresh)){toast('Chưa có dữ liệu nhận diện mới để xuất.');return}
 const source=mode==='live'?livePacket.source:'demo';
 const stamp=mode==='live'?livePacket.timestamp:Math.floor(simTime);
 const rows=[['nguon','thoi_gian','id_trong_khung','lop','do_tin_cay'],...visible().map(o=>[source,stamp,o.id,classes[o.cls].name,o.confidence])];
 download(new Blob(['\ufeff'+rows.map(r=>r.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'uav-detections-'+source+'.csv');
 toast('Đã xuất dữ liệu trong khung hiện tại; ID không phải ID tracking.');
};
$('#snapshot').onclick=()=>{
 if(mode==='file'||(mode==='live'&&!liveFresh)){toast('Chưa có ảnh mới để chụp.');return}
 canvas.toBlob(b=>{if(b)download(b,mode==='live'?'uav-camera-live.png':'uav-camera-demo.png')});
};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('#stage').requestFullscreen)await $('#stage').requestFullscreen();else toast('Trình duyệt chưa hỗ trợ toàn màn hình.')}catch{toast('Không thể mở toàn màn hình trên trình duyệt này.')}};
$('#upload').onclick=()=>$('#file').click();
function clearMedia(){const v=$('#video');v.pause();v.removeAttribute('src');v.load();$('#localImage').removeAttribute('src');if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null}
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith('image/')&&!f.type.startsWith('video/')){toast('Vui lòng chọn tệp ảnh hoặc video.');return}clearMedia();objectURL=URL.createObjectURL(f);mode='file';canvas.hidden=true;$('#localImage').hidden=true;$('#video').hidden=true;const target=f.type.startsWith('video/')?$('#video'):$('#localImage');target.src=objectURL;target.hidden=false;target.onerror=()=>toast('Không đọc được định dạng này. Hãy thử JPG, PNG hoặc MP4 tương thích trình duyệt.');$('#upload-note').hidden=false;$('#reset').hidden=false;$('#source-label').textContent='TỆP CỤC BỘ / CHỈ XEM TRƯỚC';$('#scene-status').textContent='XEM TRƯỚC';$('#pause').disabled=true;$('#boxes').disabled=true;$('#altitude').disabled=true;$('#altitude-hint').textContent='Chế độ xem tệp: quay về demo để thay đổi độ cao camera.';$('#elapsed').textContent='—';update();toast('Đã mở tệp trên thiết bị. Chưa chạy YOLO trên tệp này.')};
$('#reset').onclick=()=>{clearMedia();mode='demo';canvas.hidden=false;$('#video').hidden=true;$('#localImage').hidden=true;$('#upload-note').hidden=true;$('#reset').hidden=true;$('#file').value='';$('#source-label').textContent='GAZEBO INSPIRED / CẢNH MINH HỌA';$('#scene-status').textContent=running?'● DEMO':'Ⅱ TẠM DỪNG';$('#pause').disabled=false;$('#boxes').disabled=false;$('#altitude').disabled=false;$('#altitude-hint').textContent='Kéo để thay đổi tầm nhìn camera demo. Không điều khiển UAV thật.';update()};
function clock(){$('#clock').textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date())}clock();setInterval(clock,30000);
const canvas=$('#scene'),ctx=canvas.getContext('2d'),W=1200,H=680;
// Procedural illustration, not a camera stream or inference result.
function polygon(points,fill){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
// Fixed field of view: apparent world size varies inversely with altitude.
let cameraX=0,cameraY=0,cameraYaw=0;
function cameraScale(){return 15/altitude}
function cameraPoint(p){const scale=cameraScale();const x=p.x-W/2-cameraX,y=p.y-H/2-cameraY,c=Math.cos(cameraYaw),s=Math.sin(cameraYaw);return{x:W/2+(x*c+y*s)*scale,y:H/2+(-x*s+y*c)*scale}}
function inCamera(o){const angle=vehicleAngle(o)-cameraYaw,p=cameraPoint(position(o)),{w,h}=vehicleSize(o),scale=cameraScale();const halfW=(Math.abs(Math.cos(angle))*(w+4)+Math.abs(Math.sin(angle))*h)*scale/2;const halfH=(Math.abs(Math.sin(angle))*(w+4)+Math.abs(Math.cos(angle))*h)*scale/2;return p.x+halfW>=0&&p.x-halfW<=W&&p.y+halfH>=0&&p.y-halfH<=H}
$('#altitude').oninput=e=>{
 if(mode!=='demo')return;
 const value=Number(e.target.value);if(!Number.isFinite(value))return;
 altitude=Math.max(4,Math.min(35,value));
 $('#altitude').value=String(altitude);
 $('#altitude').setAttribute('aria-valuetext',`${altitude} mét`);
 $('#altitude-value').textContent=`${altitude} m`;
 $('#altitude-metric').textContent=altitude.toFixed(1).replace('.',',');
 $('#altitude-hud').textContent=`${altitude} m`;
 draw();update();
};
function road(){
 ctx.fillStyle='#536b59';ctx.fillRect(-4000,-4000,9000,9000);
 ctx.save();ctx.translate(W/2,H/2);
 // Sidewalks then asphalt: four continuous arms of the junction.
 ctx.fillStyle='#9a9e8f';ctx.fillRect(-194,ROAD_START,388,ROAD_LENGTH);ctx.fillRect(ROAD_START,-194,ROAD_LENGTH,388);
 ctx.fillStyle='#364248';ctx.fillRect(-150,ROAD_START,300,ROAD_LENGTH);ctx.fillRect(ROAD_START,-150,ROAD_LENGTH,300);
 for(const horizontal of [false,true]){
  ctx.save();if(horizontal)ctx.rotate(Math.PI/2);
  for(const x of [-146,-75,0,75,146]){
   ctx.strokeStyle=x===0?'#d9c97e':'#cad4cc';ctx.lineWidth=x===0?3:2;ctx.setLineDash(Math.abs(x)===75?[22,24]:[]);
   for(const [a,b] of [[ROAD_START,-150],[150,ROAD_END]]){ctx.beginPath();ctx.moveTo(x,a);ctx.lineTo(x,b);ctx.stroke()}
  }
  ctx.setLineDash([]);
  for(const side of [-1,1]){
   ctx.fillStyle='#dce1d5';for(let x=-137;x<138;x+=22)ctx.fillRect(x,side>0?164:-185,12,21);
   ctx.fillRect(side>0?5:-145,side>0?207:-211,140,4);
   for(let y=320;y<ROAD_END;y+=360){ctx.save();ctx.translate(side*38,side*y);ctx.rotate(side>0?0:Math.PI);polygon([[-3,17],[-3,-4],[-11,-4],[0,-21],[11,-4],[3,-4],[3,17]],'#c4d1c180');ctx.restore()}
  }
  ctx.restore();
 }
 // Trees stay clear of the intersection and all carriageways.
 for(let i=-7;i<=7;i++)for(const side of [-1,1]){
  const t=i*330;if(Math.abs(t)<260)continue;
  for(const [x,y] of [[side*270,t],[t,side*270]]){ctx.fillStyle='#243e3055';ctx.beginPath();ctx.arc(x+8,y+9,29,0,7);ctx.fill();ctx.fillStyle=i%2?'#3c6047':'#446f51';ctx.beginPath();ctx.arc(x,y,25,0,7);ctx.fill()}
 }
 for(const [x,y,axis] of [[-178,-224,'v'],[178,224,'v'],[-224,178,'h'],[224,-178,'h']]){
  const green=laneGreen({axis});ctx.fillStyle='#1b2927';ctx.fillRect(x-10,y-18,20,36);ctx.fillStyle=green?'#55d9a0':'#ef7568';ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.fill();
 }
 ctx.restore();
}
function position(o){const lane=lanes[o.lane];return lane.axis==='v'?{x:W/2+lane.center,y:H/2+o.q*lane.direction}:{x:W/2+o.q*lane.direction,y:H/2+lane.center}}
function vehicleAngle(o){const lane=lanes[o.lane];return lane.axis==='v'?(lane.direction===1?Math.PI:0):(lane.direction===1?Math.PI/2:-Math.PI/2)}
function vehicleSize(o){return {w:o.cls===2||o.cls===0?12:o.cls===3?32:27,h:o.cls===2||o.cls===0?24:o.cls===3?87:o.cls===4?65:49}}
function drawVehicle(o){const angle=vehicleAngle(o),p=position(o),small=o.cls===2||o.cls===0,{w,h}=vehicleSize(o);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.fillStyle='#15202266';ctx.fillRect(-w/2+7,-h/2+8,w,h);if(o.cls===0){ctx.fillStyle='#b7ab89';ctx.beginPath();ctx.arc(0,-4,6,0,7);ctx.fill();ctx.fillStyle='#647c91';ctx.fillRect(-6,1,12,15)}else{ctx.fillStyle='#182023';ctx.fillRect(-w/2-2,-h/2+5,w+4,h-10);ctx.fillStyle=o.cls===2?'#b4b6a2':['#c8c9bb','#84919a','#bbc5be','#9ca6a2','#a08f78'][Number(o.id.slice(1))%5];ctx.fillRect(-w/2,-h/2,w,h);ctx.fillStyle='#293f46';ctx.fillRect(-w/2+3,-h/2+8,w-6,small?7:11);ctx.fillRect(-w/2+3,h/2-14,w-6,8);if(!small){ctx.fillStyle='#d5ddd24f';ctx.fillRect(-w/2+3,-h/2+22,w-6,h-41)}else{ctx.fillStyle='#313b37';ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill()}ctx.fillStyle='#ece8b1';ctx.fillRect(-w/2,-h/2,4,3);ctx.fillRect(w/2-4,-h/2,4,3)}ctx.restore();if(showBoxes&&selected.has(o.cls)&&o.confidence>=threshold){const c=classes[o.cls],bw=Math.abs(Math.cos(angle))*(w+4)+Math.abs(Math.sin(angle))*h+10,bh=Math.abs(Math.sin(angle))*(w+4)+Math.abs(Math.cos(angle))*h+10;ctx.strokeStyle=c.color;ctx.lineWidth=1.7;ctx.strokeRect(p.x-bw/2,p.y-bh/2,bw,bh);const label=`${c.name} ${o.confidence.toFixed(2)}`;ctx.font='12px Arial';const tw=ctx.measureText(label).width;ctx.fillStyle=c.color;ctx.fillRect(p.x-bw/2,p.y-bh/2-20,tw+12,20);ctx.fillStyle='#102a26';ctx.fillText(label,p.x-bw/2+6,p.y-bh/2-6)}}
function draw(){ctx.save();ctx.translate(W/2,H/2);ctx.scale(cameraScale(),cameraScale());ctx.rotate(-cameraYaw);ctx.translate(-W/2-cameraX,-H/2-cameraY);road();objects.forEach(drawVehicle);ctx.restore();const g=ctx.createRadialGradient(W/2,H/2,100,W/2,H/2,760);g.addColorStop(0,'#10252200');g.addColorStop(1,'#0b1e2555');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle='#c6dfcd';ctx.font='10px monospace';ctx.fillText('N',W-49,80);ctx.strokeStyle='#c6dfcd';ctx.beginPath();ctx.moveTo(W-46,120);ctx.lineTo(W-46,90);ctx.lineTo(W-51,99);ctx.moveTo(W-46,90);ctx.lineTo(W-41,99);ctx.stroke();ctx.fillText(`CAMERA ${altitude} m · CẢNH MINH HỌA · KHÔNG PHẢI CAMERA THẬT`,18,H-44)}
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){running=false;$('#pause').textContent='▶ Tiếp tục';$('#scene-status').textContent='Ⅱ TẠM DỪNG'}let lastDraw=0,lastStats=0;function frame(now){const dt=previous?Math.min((now-previous)/1000,.1):0;previous=now;if(mode==='demo'&&running){simTime+=dt;advanceTraffic(dt)}if(mode==='demo'&&now-lastDraw>50){draw();lastDraw=now;$('#elapsed').textContent=`${String(Math.floor(simTime/60)).padStart(2,'0')}:${String(Math.floor(simTime%60)).padStart(2,'0')}`}if(mode==='demo'&&now-lastStats>250){update();lastStats=now}requestAnimationFrame(frame)}update();requestAnimationFrame(frame);
