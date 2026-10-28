'use strict';
let bridgeSocket=null,bridgeGeneration=0,bridgeSource=null,bridgeTelemetry=null;
let livePaused=false,lastLiveReceived=0,decodeBusy=false,connectionTimer=null;
let pendingCommand=null,commandTimer=null,targetTouched=false,targetInitialized=false;
const COCO_LOCAL=[0,2,3,5,7];
function message(text){$('#connection-message').textContent=text}
function sourceName(){return {ros:'ROS 2',video:'VIDEO + YOLO',test:'TEST KẾT NỐI'}[bridgeSource]||'BACKEND'}
function setNotice(title,description,error=false){$('#mode-title').textContent=title;$('#mode-description').textContent=' '+description;$('#monitor-notice').classList.toggle('live-notice',mode==='live'&&!error);$('#monitor-notice').classList.toggle('error-notice',error)}
function drawLive(){
 if(mode!=='live')return;
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#1c3031';ctx.fillRect(0,0,W,H);
 if(!liveFresh||!livePacket||!liveFrame){ctx.fillStyle='#a7c5b8';ctx.font='18px Arial';ctx.textAlign='center';ctx.fillText('Đang chờ ảnh mới từ backend',W/2,H/2);ctx.font='13px Arial';ctx.fillText('Không sử dụng dữ liệu mô phỏng',W/2,H/2+30);ctx.textAlign='left';return}
 const scale=Math.min(W/livePacket.width,H/livePacket.height),ox=(W-livePacket.width*scale)/2,oy=(H-livePacket.height*scale)/2;
 ctx.drawImage(liveFrame,ox,oy,livePacket.width*scale,livePacket.height*scale);
 if(showBoxes)visible().forEach(o=>{
  const c=classes[o.cls],[x1,y1,x2,y2]=o.xyxy;
  const x=ox+x1*scale,y=oy+y1*scale,w=(x2-x1)*scale,h=(y2-y1)*scale;
  ctx.strokeStyle=c.color;ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
  ctx.font='13px Arial';const label=`${c.name} ${Math.round(o.confidence*100)}%`,tw=ctx.measureText(label).width+12;
  const labelX=Math.min(Math.max(0,x),W-tw),labelY=Math.max(0,y-22);
  ctx.fillStyle=c.color;ctx.fillRect(labelX,labelY,tw,22);ctx.fillStyle='#102a26';ctx.fillText(label,labelX+6,labelY+15);
 });
 ctx.fillStyle='#0a211dbb';ctx.fillRect(12,H-60,Math.min(W-24,600),24);ctx.font='11px Arial';ctx.fillStyle='#d6f4e4';
 ctx.fillText(`${sourceName()} · FRAME ${livePacket.seq} · ${livePaused?'TẠM DỪNG XEM':'ĐANG NHẬN ẢNH'}`,21,H-44);
}
function updateTelemetry(t){
 bridgeTelemetry=t&&typeof t==='object'?t:{};
 const measured=bridgeTelemetry.connected===true&&typeof bridgeTelemetry.relative_altitude_m==='number'&&Number.isFinite(bridgeTelemetry.relative_altitude_m)?bridgeTelemetry.relative_altitude_m:null;
 $('#altitude-metric').textContent=measured===null?'—':measured.toFixed(1).replace('.',',');
 $('#altitude-hud').textContent=measured===null?'— m':measured.toFixed(1)+' m';
 $('#altitude-footer').textContent=measured===null?'Chưa có telemetry độ cao mới':`Đo được · ${String(bridgeTelemetry.flight_mode||'MAVSDK').slice(0,30)}`;
 if(!targetTouched&&!targetInitialized&&measured!==null){$('#altitude').value=String(Math.round(Math.max(4,Math.min(35,measured))));targetInitialized=true}
 $('#altitude-value').textContent=`${$('#altitude').value} m mục tiêu`;
 const can=bridgeTelemetry.can_set_altitude===true&&liveFresh&&bridgeSource==='ros'&&bridgeSocket?.readyState===WebSocket.OPEN;
 $('#altitude').disabled=!can;$('#send-altitude').hidden=false;$('#send-altitude').disabled=!can||pendingCommand!==null;
 if(typeof refreshFlightControls==='function')refreshFlightControls();
 $('#altitude-hint').textContent=String(bridgeTelemetry.reason||'Chưa có telemetry MAVSDK').slice(0,250)+'. Giá trị kéo là mục tiêu; độ cao đo được hiển thị trên thẻ phía trên.';
}
function markStale(text){
 if(mode!=='live')return;
 liveFresh=false;livePacket=null;liveFrame=null;$('#scene-status').textContent='● CHỜ TÍN HIỆU';$('#session-connection').textContent=text;$('#elapsed').textContent='—';
 setNotice('Chưa có ảnh mới',text,true);updateTelemetry(null);update();
}
function stopBridge(){
 bridgeGeneration++;clearTimeout(connectionTimer);clearTimeout(commandTimer);pendingCommand=null;
 const socket=bridgeSocket;bridgeSocket=null;if(socket)socket.close(1000,'Viewer disconnected');
 liveFresh=false;livePacket=null;liveFrame=null;decodeBusy=false;bridgeSource=null;bridgeTelemetry=null;
 $('#connect-submit').disabled=false;$('#disconnect').disabled=true;
}
function restoreDemoUI(){
 $('#camera-badge').textContent='MÔ PHỎNG';$('#distribution-tag').textContent='DEMO';$('#session-badge').textContent='MINH HỌA';
 $('#session-source').textContent='Gazebo → ROS 2 /camera';$('#session-model').textContent='YOLOv8m · best.pt';$('#session-connection').textContent='Chưa kết nối backend';
 $('#list-header-label').textContent='ĐỐI TƯỢNG / ID DEMO';$('#tracking-note').textContent='Các ID chỉ minh họa, chưa phải kết quả tracking.';
 $('#altitude-label').textContent='Độ cao camera mô phỏng';$('#send-altitude').hidden=true;$('#altitude-footer').textContent='Thông số demo · Góc camera 52°';
 $('#altitude').value=String(altitude);$('#altitude-value').textContent=`${altitude} m`;$('#altitude-metric').textContent=altitude.toFixed(1).replace('.',',');$('#altitude-hud').textContent=`${altitude} m`;
 $('#pause').textContent=running?'Ⅱ Tạm dừng':'▶ Tiếp tục';$('#reset').hidden=true;
 setNotice('Chế độ trình diễn','Cảnh chuyển động và số liệu bên dưới là dữ liệu demo. Chọn Kết nối ROS 2 để nhận ảnh và kết quả YOLO từ máy xử lý.');
}
const resetDemo=$('#reset').onclick;
$('#reset').onclick=()=>{stopBridge();resetDemo();restoreDemoUI();message('Đã ngắt backend và quay về demo.')};
const fileChange=$('#file').onchange;
$('#file').onchange=e=>{const f=e.target.files?.[0];if(f&&(f.type.startsWith('image/')||f.type.startsWith('video/'))){stopBridge();restoreDemoUI()}fileChange(e);if(mode==='file'){$('#camera-badge').textContent='XEM TỆP';$('#session-badge').textContent='XEM TỆP';$('#distribution-tag').textContent='CHƯA NHẬN DIỆN';$('#session-connection').textContent='Xem tệp cục bộ';setNotice('Xem trước tệp','Tệp chỉ được xem trên thiết bị. Chưa chạy YOLO trên tệp này; dùng backend --source video để nhận diện video.')}};
const pauseDemo=$('#pause').onclick;
$('#pause').onclick=()=>{if(mode!=='live'){pauseDemo();return}livePaused=!livePaused;$('#pause').textContent=livePaused?'▶ Tiếp tục xem':'Ⅱ Tạm dừng xem';$('#scene-status').textContent=livePaused?'Ⅱ TẠM DỪNG XEM':'● '+sourceName();drawLive()};
const boxesDemo=$('#boxes').onclick;
$('#boxes').onclick=()=>{boxesDemo();if(mode==='live')drawLive()};
const altitudeDemo=$('#altitude').oninput;
$('#altitude').oninput=e=>{if(mode!=='live'){altitudeDemo(e);return}const value=Number(e.target.value);if(!Number.isFinite(value))return;$('#altitude').value=String(Math.max(4,Math.min(35,value)));targetTouched=true;$('#altitude-value').textContent=`${$('#altitude').value} m mục tiêu`;$('#altitude').setAttribute('aria-valuetext',`${$('#altitude').value} mét mục tiêu`)};
$('#send-altitude').onclick=()=>{
 if(mode!=='live'||!liveFresh||!bridgeTelemetry?.can_set_altitude||bridgeSocket?.readyState!==WebSocket.OPEN||pendingCommand)return;
 pendingCommand='alt-'+Date.now();$('#send-altitude').disabled=true;
 bridgeSocket.send(JSON.stringify({type:'set_altitude',request_id:pendingCommand,altitude_m:Number($('#altitude').value)}));
 message('Đang chờ PX4 phản hồi lệnh độ cao...');
 commandTimer=setTimeout(()=>{pendingCommand=null;message('Chưa nhận phản hồi lệnh. Kiểm tra telemetry trước khi gửi lại.');updateTelemetry(bridgeTelemetry)},7500);
};
function validPacket(p){
 if(!p||p.type!=='frame'||p.source!==bridgeSource||!Number.isSafeInteger(p.seq)||p.seq<0||!Number.isFinite(p.timestamp)||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width>4096||p.height>4096||typeof p.image!=='string'||p.image.length>8000000||!p.image.startsWith('/9j/')||!Array.isArray(p.detections)||p.detections.length>1000)return null;
 const detections=[];
 for(const o of p.detections){if(!o||!Number.isInteger(o.cls)||o.cls<0||o.cls>4||typeof o.confidence!=='number'||!Number.isFinite(o.confidence)||o.confidence<0||o.confidence>1||!Array.isArray(o.xyxy)||o.xyxy.length!==4||!o.xyxy.every(Number.isFinite))continue;const [x1,y1,x2,y2]=o.xyxy;if(x1<0||y1<0||x2>p.width||y2>p.height||x2<=x1||y2<=y1)continue;detections.push({id:`F${p.seq}-${detections.length+1}`,cls:o.cls,confidence:o.confidence,xyxy:[x1,y1,x2,y2]})}
 return {...p,detections};
}
$('#connection-form').onsubmit=e=>{
 e.preventDefault();let url;
 try{url=new URL($('#bridge-url').value.trim());if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw Error('Địa chỉ phải bắt đầu bằng ws:// hoặc wss://, không kèm khóa hay tham số.');if(location.protocol==='https:'&&url.protocol!=='wss:')throw Error('Trang HTTPS cần wss://. Dùng bản web local trong gói tải về để kết nối ws://127.0.0.1:8765.')}catch(err){message(err.message);return}
 const token=$('#bridge-token').value;if(token.length<16){message('Khóa truy cập cần ít nhất 16 ký tự.');return}
 stopBridge();clearMedia();mode='live';livePaused=false;targetTouched=false;targetInitialized=false;
 canvas.hidden=false;$('#video').hidden=true;$('#localImage').hidden=true;$('#upload-note').hidden=true;$('#reset').hidden=false;$('#reset').textContent='Về demo';
 $('#camera-badge').textContent='ĐANG KẾT NỐI';$('#distribution-tag').textContent='BACKEND';$('#session-badge').textContent='BACKEND';$('#session-source').textContent='Đang chờ xác thực';$('#session-model').textContent='—';$('#session-connection').textContent='Đang kết nối';
 $('#list-header-label').textContent='ĐỐI TƯỢNG / ID TRONG KHUNG';$('#tracking-note').textContent='ID thay đổi theo từng khung; chưa có tracking hoặc đếm lưu lượng.';
 $('#altitude-label').textContent='Độ cao mục tiêu UAV';$('#pause').textContent='Ⅱ Tạm dừng xem';$('#pause').disabled=false;$('#boxes').disabled=false;$('#source-label').textContent='WEBSOCKET / CHỜ ẢNH';$('#elapsed').textContent='—';
 setNotice('Đang kết nối backend','Đang chờ xác thực và ảnh camera. Không sử dụng dữ liệu demo.');updateTelemetry(null);update();
 const generation=bridgeGeneration;const socket=new WebSocket(url.href);bridgeSocket=socket;
 $('#connect-submit').disabled=true;$('#disconnect').disabled=false;message('Đang kết nối và xác thực...');
 connectionTimer=setTimeout(()=>{if(generation===bridgeGeneration){message('Không nhận được xác thực sau 10 giây. Kiểm tra địa chỉ, khóa và mạng.');socket.close()}},10000);
 socket.onopen=()=>{if(generation!==bridgeGeneration)return;socket.send(JSON.stringify({type:'auth',protocol:1,token}));$('#bridge-token').value=''};
 socket.onmessage=event=>{
  if(generation!==bridgeGeneration||mode!=='live'||typeof event.data!=='string'||event.data.length>10000000)return;
  let p;try{p=JSON.parse(event.data)}catch{return}if(!p||typeof p!=='object')return;
  if(p.type==='hello'){
   if(p.protocol!==1||!['ros','video','test'].includes(p.source)){message('Backend không đúng giao thức v1.');socket.close();return}
   clearTimeout(connectionTimer);bridgeSource=p.source;$('#connect-submit').disabled=false;
   $('#camera-badge').textContent=sourceName();$('#session-badge').textContent=sourceName();$('#distribution-tag').textContent=sourceName();
   $('#session-source').textContent=bridgeSource==='ros'?'ROS 2 '+String(p.topic||'/camera').slice(0,100):sourceName();$('#session-model').textContent=bridgeSource==='test'?'Không chạy YOLO':String(p.model||'YOLO').slice(0,100);
   $('#source-label').textContent=sourceName()+' / DỮ LIỆU TỪ BACKEND';message('Đã xác thực. Đang chờ ảnh từ '+sourceName()+'.');updateTelemetry(p.telemetry);return;
  }
  if(p.type==='status'){
   if(!bridgeSource)return;if(p.camera_fresh!==true){markStale(String(p.message||'Camera không có ảnh mới').slice(0,250))}else{updateTelemetry(p.telemetry)}return;
  }
  if(p.type==='command_result'){
   if(p.request_id!==pendingCommand)return;pendingCommand=null;clearTimeout(commandTimer);const text=String(p.message||'Đã nhận phản hồi lệnh').slice(0,300);message(text);toast(text);updateTelemetry(bridgeTelemetry);return;
  }
  const packet=validPacket(p);if(!packet)return;lastLiveReceived=performance.now();
  if(livePaused||decodeBusy)return;decodeBusy=true;const image=new Image();
  image.onload=()=>{if(generation!==bridgeGeneration||mode!=='live')return;decodeBusy=false;if(livePaused)return;if(image.naturalWidth!==packet.width||image.naturalHeight!==packet.height){markStale('Kích thước ảnh không khớp dữ liệu nhận diện');return}
   liveFrame=image;livePacket=packet;liveFresh=true;lastLiveReceived=performance.now();
   $('#scene-status').textContent='● '+sourceName();$('#session-connection').textContent='Đang nhận ảnh';$('#elapsed').textContent=new Date(packet.timestamp*1000).toLocaleTimeString('vi-VN');
   setNotice(bridgeSource==='test'?'Test đường truyền':bridgeSource==='ros'?'Đang nhận luồng ROS 2':'Nhận diện video từ backend',bridgeSource==='test'?'Ảnh và nhãn tổng hợp để kiểm tra kết nối; không phải ROS hoặc YOLO.':'Ảnh và kết quả nhận diện đồng bộ từ máy xử lý. Khung không phải kết quả tracking.');
   updateTelemetry(packet.telemetry);update();
  };image.onerror=()=>{if(generation!==bridgeGeneration||mode!=='live')return;decodeBusy=false;markStale('Không giải mã được ảnh JPEG từ backend')};image.src='data:image/jpeg;base64,'+packet.image;
 };
 socket.onerror=()=>{if(generation!==bridgeGeneration)return;message('Không kết nối được. Kiểm tra backend, chứng chỉ WSS, địa chỉ và Origin được cho phép.')};
 socket.onclose=event=>{if(generation!==bridgeGeneration)return;clearTimeout(connectionTimer);clearTimeout(commandTimer);pendingCommand=null;bridgeSocket=null;$('#connect-submit').disabled=false;$('#disconnect').disabled=true;markStale('Kết nối đã đóng. Mở Kết nối ROS 2 để thử lại.');message(event.code===1008?'Xác thực bị từ chối hoặc thiếu khóa. Kiểm tra UAV_BRIDGE_TOKEN.':'Đã ngắt kết nối backend. Không tự chuyển sang dữ liệu demo.')};
};
$('#disconnect').onclick=()=>{stopBridge();if(mode==='live')markStale('Đã ngắt kết nối theo yêu cầu.');message('Đã ngắt kết nối. Bấm Về demo nếu muốn dùng mô phỏng.')};
setInterval(()=>{if(mode==='live'&&liveFresh&&performance.now()-lastLiveReceived>3500){markStale('Không nhận được khung hình mới trong hơn 3,5 giây.')}},500);
if(location.protocol==='http:')$('#bridge-url').value='ws://127.0.0.1:8765';
