'use strict';
const panelDefinitions=[['metrics-panel','Thông số'],['.camera-panel','Camera'],['.detections','Nhận diện'],['flight-panel','Điều khiển'],['.distribution','Phân bố'],['.session','Phiên quan sát']];
const panelEntries=panelDefinitions.map(([selector,label])=>({key:selector,label,element:document.querySelector(selector.startsWith('.')?selector:'#'+selector)}));
let panelSettings={};try{panelSettings=JSON.parse(localStorage.getItem('uav-panels-v1')||'{}')||{}}catch{}
function applyPanels(){
 panelEntries.forEach(p=>{p.element.hidden=panelSettings[p.key]===false;p.checkbox.checked=!p.element.hidden});
 $('.monitor-grid').classList.toggle('camera-wide',panelEntries[1].element.hidden||panelEntries[2].element.hidden);
 $('.monitor-grid').hidden=panelEntries[1].element.hidden&&panelEntries[2].element.hidden;
 $('.lower-grid').classList.toggle('single-panel',panelEntries[4].element.hidden||panelEntries[5].element.hidden);
 $('.lower-grid').hidden=panelEntries[4].element.hidden&&panelEntries[5].element.hidden;
 try{localStorage.setItem('uav-panels-v1',JSON.stringify(panelSettings))}catch{}
}
panelEntries.forEach(p=>{
 const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-controls',p.element.id||(p.element.id='panel-'+p.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s/g,'-')));label.append(input,document.createTextNode(p.label));p.checkbox=input;input.onchange=()=>{panelSettings[p.key]=input.checked;applyPanels()};$('#panel-toggles').append(label);
 const heading=p.element.querySelector('.panel-heading');if(heading){const b=document.createElement('button');b.className='panel-hide';b.textContent='Ẩn';b.setAttribute('aria-label','Ẩn '+p.label);b.onclick=()=>{panelSettings[p.key]=false;applyPanels();input.focus()};heading.append(b)}
});
$('#focus-camera').onclick=()=>{panelEntries.forEach(p=>panelSettings[p.key]=p.key==='.camera-panel');applyPanels()};
$('#show-panels').onclick=()=>{panelSettings={};applyPanels()};applyPanels();
function flightAvailable(action){
 if(mode==='demo')return true;
 if(mode!=='live'||!liveFresh||livePaused||bridgeSource!=='ros'||bridgeSocket?.readyState!==WebSocket.OPEN||pendingCommand)return false;
 return action==='hold'?bridgeTelemetry?.can_hold===true:bridgeTelemetry?.can_control===true;
}
function refreshFlightControls(){
 $$('[data-flight]').forEach(b=>b.disabled=!flightAvailable(b.dataset.flight));
 $('#flight-badge').textContent=mode==='demo'?'DEMO':mode==='live'?'MAVSDK':'XEM TỆP';
 $('#reset-camera').hidden=mode!=='demo';
 if(mode==='demo')$('#flight-status').textContent=`X ${Math.round(cameraX/12)} m · Y ${Math.round(-cameraY/12)} m · Hướng ${Math.round(cameraYaw*180/Math.PI)}°`;
 else if(mode==='file')$('#flight-status').textContent='Xem tệp · Tắt điều khiển';
 else $('#flight-status').textContent=pendingCommand?'Đang chờ phản hồi lệnh…':bridgeTelemetry?.can_control?'Sẵn sàng':bridgeTelemetry?.reason||'Chưa kết nối điều khiển';
}
function demoFlight(action){
 if(action==='up'||action==='down'){$('#altitude').oninput({target:{value:Math.max(4,Math.min(35,altitude+(action==='up'?1:-1)))}})}
 else if(action==='yaw_left'||action==='yaw_right')cameraYaw+=(action==='yaw_right'?1:-1)*Math.PI/18;
 else if(action!=='hold'){
  const forward=action==='forward'?1:action==='backward'?-1:0,right=action==='right'?1:action==='left'?-1:0;
  cameraX=Math.max(-600,Math.min(600,cameraX+12*(right*Math.cos(cameraYaw)+forward*Math.sin(cameraYaw))));
  cameraY=Math.max(-400,Math.min(400,cameraY+12*(right*Math.sin(cameraYaw)-forward*Math.cos(cameraYaw))));
 }
 draw();update();refreshFlightControls();if(action==='hold')toast('Camera demo đang giữ vị trí; xe vẫn tiếp tục di chuyển.');
}
$$('[data-flight]').forEach(b=>b.onclick=()=>{
 const action=b.dataset.flight;if(!flightAvailable(action))return;
 if(mode==='demo'){demoFlight(action);return}
 pendingCommand='flight-'+Date.now();
 bridgeSocket.send(JSON.stringify({type:'flight_command',request_id:pendingCommand,action}));
 message('Đang chờ PX4 phản hồi…');refreshFlightControls();
 commandTimer=setTimeout(()=>{pendingCommand=null;message('Chưa nhận ACK. Kiểm tra telemetry trước khi gửi lại.');refreshFlightControls()},7500);
});
$('#reset-camera').onclick=()=>{if(mode!=='demo')return;cameraX=0;cameraY=0;cameraYaw=0;$('#altitude').oninput({target:{value:15}});draw();update();refreshFlightControls()};
setInterval(refreshFlightControls,300);refreshFlightControls();
// Floating panel: pointer dragging, keyboard movement, and viewport-safe persistence.
const flightPanel=$('#flight-panel'),dragHandle=flightPanel.querySelector('.panel-heading');
let flightPosition=null,flightDrag=null;
try{const saved=JSON.parse(localStorage.getItem('uav-flight-position-v1')||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))flightPosition=saved}catch{}
function placeFlight(x,y,save=true){
 const rect=flightPanel.getBoundingClientRect(),pad=8;
 const pos={x:Math.max(pad,Math.min(window.innerWidth-rect.width-pad,x)),y:Math.max(pad,Math.min(window.innerHeight-rect.height-pad,y))};
 flightPanel.style.left=pos.x+'px';flightPanel.style.top=pos.y+'px';flightPanel.style.right='auto';flightPanel.style.bottom='auto';flightPosition=pos;
 if(save)try{localStorage.setItem('uav-flight-position-v1',JSON.stringify(pos))}catch{}
}
function keepFlightVisible(){if(!flightPanel.hidden&&$('#monitor').classList.contains('active')){if(flightPosition)placeFlight(flightPosition.x,flightPosition.y,false)}}
dragHandle.tabIndex=0;dragHandle.setAttribute('aria-label','Kéo để di chuyển bảng điều khiển. Dùng phím mũi tên để đổi vị trí, Home để đặt lại.');dragHandle.title='Kéo bảng đến vị trí bất kỳ';
dragHandle.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.target.closest('button'))return;
 const r=flightPanel.getBoundingClientRect();flightDrag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};dragHandle.setPointerCapture(e.pointerId);flightPanel.classList.add('dragging');e.preventDefault();
});
dragHandle.addEventListener('pointermove',e=>{if(!flightDrag||e.pointerId!==flightDrag.id)return;placeFlight(e.clientX-flightDrag.x,e.clientY-flightDrag.y,false)});
function endFlightDrag(e){if(!flightDrag||e.pointerId!==flightDrag.id)return;flightDrag=null;flightPanel.classList.remove('dragging');if(flightPosition)placeFlight(flightPosition.x,flightPosition.y)}
dragHandle.addEventListener('pointerup',endFlightDrag);dragHandle.addEventListener('pointercancel',endFlightDrag);dragHandle.addEventListener('lostpointercapture',endFlightDrag);
function dockFlight(){flightPosition=null;flightPanel.style.left='';flightPanel.style.top='';flightPanel.style.right='';flightPanel.style.bottom='';try{localStorage.removeItem('uav-flight-position-v1')}catch{}}
$('#dock-flight').onclick=dockFlight;
dragHandle.addEventListener('keydown',e=>{
 if(e.target!==dragHandle)return;
 if(e.key==='Home'){e.preventDefault();dockFlight();return}
 const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;
 e.preventDefault();const r=flightPanel.getBoundingClientRect(),step=e.shiftKey?40:10;placeFlight(r.left+delta[0]*step,r.top+delta[1]*step);
});
$('#collapse-flight').onclick=()=>{const collapsed=flightPanel.classList.toggle('flight-collapsed');$('#collapse-flight').textContent=collapsed?'+':'−';$('#collapse-flight').setAttribute('aria-expanded',String(!collapsed));$('#collapse-flight').setAttribute('aria-label',collapsed?'Mở bảng điều khiển':'Thu gọn bảng điều khiển');keepFlightVisible()};
window.addEventListener('resize',keepFlightVisible);
const originalApplyPanels=applyPanels;applyPanels=function(){originalApplyPanels();keepFlightVisible()};
keepFlightVisible();
const originalSetView=setView;setView=function(view){originalSetView(view);keepFlightVisible()};
