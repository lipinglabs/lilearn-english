/* ============================================================
 * art33.js — 第三岛 3-3（长/短）全新插画生成器
 * 纯字符串 SVG，不依赖 DOM。为每张图提供 3 套画风：
 *   0 萌趣卡通  : 粗描边 + 大眼睛 + 腮红 + 渐变 + 投影
 *   1 清新扁平  : 无描边 + 双色扁平等 + 点眼
 *   2 温暖手绘  : 细描边 + 柔色 + 软眼
 * 长/短形态严格保留（不影响「比长短」玩法）。
 * ============================================================ */
(function (root) {
  'use strict';

  /* ---------- 颜色工具 ---------- */
  function hx(h){ h=(h||'#000').replace('#',''); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
  function tohex(a){ return '#'+a.map(function(v){ v=Math.max(0,Math.min(255,Math.round(v))); return ('0'+v.toString(16)).slice(-2); }).join(''); }
  function mix(c1,c2,t){ var a=hx(c1),b=hx(c2); return tohex(a.map(function(v,i){ return v+(b[i]-v)*t; })); }
  function lighten(c,t){ return mix(c,'#ffffff',t); }
  function darken(c,t){ return mix(c,'#000000',t); }
  function gray(c){ var a=hx(c); var g=(a[0]+a[1]+a[2])/3; return tohex([g,g,g]); }
  function sat(c,s){ if(s>=1) return c; return mix(gray(c),c,s); }

  /* ---------- 画风配置 ---------- */
  var STYLE = [
    { name:'萌趣卡通', desc:'粗描边·大眼·腮红', ow:3.0, oc:0.55, eyes:'cute', cheek:true,  shadow:true,  s:1.00, l:0.10 },
    { name:'清新扁平', desc:'无描边·扁平等',     ow:0,   oc:0,    eyes:'dot',  cheek:false, shadow:false, s:1.00, l:0.16 },
    { name:'温暖手绘', desc:'细描边·柔色',       ow:1.5, oc:0.22, eyes:'soft', cheek:true,  shadow:false, s:0.74, l:0.20 }
  ];

  /* ---------- 基础图元 ---------- */
  function uid(){ return 'g'+(uid.n=(uid.n||0)+1); }
  function disc(cx,cy,r,fill,ol,olw){
    var s=''; if(ol) s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(r+(olw||1))+'" fill="'+ol+'"/>';
    return s+'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"/>';
  }
  function rrect(x,y,w,h,r,fill,ol,olw){
    var s=''; if(ol) s+='<rect x="'+(x-(olw||1))+'" y="'+(y-(olw||1))+'" width="'+(w+2*(olw||1))+'" height="'+(h+2*(olw||1))+'" rx="'+(r+(olw||1))+'" fill="'+ol+'"/>';
    return s+'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'"/>';
  }
  function strokeP(d,w,fill,ol,olw,cap){
    var s=''; cap=cap||'round';
    if(ol) s+='<path d="'+d+'" fill="none" stroke="'+ol+'" stroke-width="'+(w+2*(olw||1))+'" stroke-linecap="'+cap+'" stroke-linejoin="round"/>';
    return s+'<path d="'+d+'" fill="none" stroke="'+fill+'" stroke-width="'+w+'" stroke-linecap="'+cap+'" stroke-linejoin="round"/>';
  }
  function eyes(st,x,y,r){
    if(st.eyes==='cute') return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#fff"/>'+
      '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.58)+'" fill="#2b2b2b"/>'+
      '<circle cx="'+(x-r*0.22)+'" cy="'+(y-r*0.24)+'" r="'+(r*0.24)+'" fill="#fff"/>';
    if(st.eyes==='dot') return '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.5)+'" fill="#3b2f2a"/>';
    return '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.7)+'" fill="#3b2f2a"/>'+
      '<circle cx="'+(x-r*0.2)+'" cy="'+(y-r*0.2)+'" r="'+(r*0.22)+'" fill="#fff"/>';
  }
  function cheeks(st,x,y){
    if(!st.cheek) return '';
    return '<circle cx="'+x+'" cy="'+y+'" r="3.4" fill="#ff9bb3" opacity="0.6"/>'+
           '<circle cx="'+(x+13)+'" cy="'+y+'" r="3.4" fill="#ff9bb3" opacity="0.6"/>';
  }
  function shadow(st,cx,cy,rx){
    if(!st.shadow) return '';
    return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="6" fill="#000" opacity="0.10"/>';
  }

  /* ---------- 各物件绘制（返回 inner svg） ---------- */
  function dSnake(cmp,st){
    var lng = cmp==='long';
    var x0 = lng?20:78, x1 = lng?176:168, w = lng?20:18;
    var c = sat('#5fc26a',st.s), dk = darken(c,0.3), lt = lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var cy0=84, cy1=70;
    var d = 'M'+x0+' '+cy0+' C '+(x0+34)+' 52, '+(x0+66)+' 52, '+(x0+84)+' 76 C '+(x0+98)+' 96, '+(x1-34)+' 96, '+(x1-14)+' '+cy1;
    var hx=x1-4, hy=cy1, s='';
    s+= shadow(st,(x0+x1)/2,108,Math.abs(x1-x0)/2);
    if(ol) s+= strokeP(d,w+2*st.ow,ol,null,0);
    s+= '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
    s+= '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="'+(w*0.38)+'" stroke-linecap="round" opacity="0.7"/>';
    // 背纹
    for(var i=0;i<(lng?5:3);i++){ var t=(i+1)/(lng?6:4); var bx=Math.round(x0+(x1-x0)*t); s+='<circle cx="'+bx+'" cy="78" r="2.4" fill="'+dk+'" opacity="0.5"/>'; }
    s+= disc(hx,hy,15,c,ol,st.ow);
    s+= eyes(st,hx-4,hy-3,3.2)+eyes(st,hx+6,hy-3,3.2);
    s+= '<path d="M'+(hx-6)+' '+(hy+6)+' q6 6 12 0" fill="none" stroke="#3b2f2a" stroke-width="2" stroke-linecap="round"/>';
    s+= cheeks(st,hx-8,hy+3);
    s+= '<path d="M'+(hx+13)+' '+hy+' l9 -3 -9 -3 z" fill="#ff5d7a"/>';
    return s;
  }

  function dRope(cmp,st){
    var lng = cmp==='long';
    var x0 = lng?16:74, x1 = lng?188:172, w=16;
    var c = sat('#cf9a5b',st.s), dk = darken(c,0.32), lt = lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var y=68;
    var d='M'+x0+' '+y+' C '+(x0+44)+' 46, '+(x0+88)+' 90, '+(x0+128)+' 68 C '+(x0+158)+' 52, '+(x1-22)+' 52, '+x1+' '+y;
    var s=''; s+= shadow(st,(x0+x1)/2,104,(x1-x0)/2);
    if(ol) s+= strokeP(d,w+2*st.ow,ol,null,0);
    s+= '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
    s+= '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="'+(w*0.34)+'" stroke-linecap="round" opacity="0.7"/>';
    // 麻绳绞纹
    var n = lng?7:4;
    for(var i=1;i<=n;i++){ var t=i/(n+1); var bx=Math.round(x0+(x1-x0)*t); var by=68;
      s+='<path d="M'+(bx-6)+' '+(by-5)+' l5 10 M'+(bx+1)+' '+(by-5)+' l5 10" stroke="'+dk+'" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>'; }
    // 散口
    s+= '<circle cx="'+x0+'" cy="'+y+'" r="6" fill="'+dk+'"/>';
    s+= '<path d="M'+(x1-2)+' '+(y-6)+' l6 -4 M'+(x1)+' '+y+' l8 0 M'+(x1-2)+' '+(y+6)+' l6 4" stroke="'+dk+'" stroke-width="2.4" stroke-linecap="round"/>';
    return s;
  }

  function dPencil(cmp,st){
    var lng = cmp==='long';
    var bx = lng?14:52, bw = lng?150:84, by=54, bh=20;
    var c = sat('#ffd23d',st.s), dk=darken(c,0.28), lt=lighten(c,st.l);
    var wood='#e8c39a', woodD=darken(wood,0.18), graph='#3a3a3a', era='#ff7aa2', eraD=darken(era,0.2);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s=''; s+= shadow(st,bx+bw/2,94,bw/2);
    var tx = bx+bw; // tip end (right)
    if(ol) s+= rrect(bx,by-ol,bw+2*ol,bh+2*ol,bh/2,ol,null,0);
    s+= rrect(bx,by,bw,bh,bh/2,c,null,0);
    s+= rrect(bx,by,bw,bh*0.42,bh/2,lt,null,0);
    // 笔尖（右）木锥 + 石墨
    s+= '<path d="M'+tx+' '+by+' l22 10 -22 10 z" fill="'+(ol?ol:wood)+'"/>';
    if(ol) s+='<path d="M'+(tx)+' '+by+' l22 10 -22 10 z" fill="'+wood+'"/>';
    s+= '<path d="M'+(tx+12)+' '+(by+5)+' l10 5 -10 5 z" fill="'+graph+'"/>';
    // 橡皮（左）+ 金属箍
    s+= rrect(bx-16,by,16,bh,bh/2,era,ol,st.ow);
    s+= rrect(bx-2,by,4,bh,1,eraD,null,0);
    if(st.eyes!=='dot'){ s+= '<path d="M'+(bx+bw*0.5)+' '+(by-2)+' l0 -3" stroke="'+dk+'" stroke-width="1.4" opacity="0.5"/>'; }
    return s;
  }

  function dBread(cmp,st){
    var c = sat('#e6a94e',st.s), dk=darken(c,0.26), lt=lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s='';
    if(cmp==='long'){
      var x=14,y=46,w=170,h=34;
      s+= shadow(st,x+w/2,96,w/2);
      if(ol) s+= rrect(x-ol,y-ol,w+2*ol,h+2*ol,h/2,ol,null,0);
      s+= rrect(x,y,w,h,h/2,c,null,0);
      s+= rrect(x,y,w,h*0.45,h/2,lt,null,0);
      for(var i=1;i<=5;i++){ var sx=Math.round(x+18+i*28); s+='<path d="M'+sx+' '+(y+8)+' l-7 16" stroke="'+dk+'" stroke-width="2.6" stroke-linecap="round" opacity="0.6"/>'; }
    } else {
      var cx=100,cy=66,r=30;
      s+= shadow(st,cx,104,r);
      s+= disc(cx,cy,r,c,ol,st.ow);
      s+= '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+lt+'" stroke-width="6"/>';
      s+= '<path d="M'+(cx-12)+' '+(cy-6)+' q12 12 24 0" stroke="'+dk+'" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.6"/>';
    }
    return s;
  }

  function dScarf(cmp,st){
    var lng = cmp==='long';
    var w = lng?150:78, x=20, y=44;
    var c = sat('#ff7a8a',st.s), dk=darken(c,0.26), lt=lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s=''; s+= shadow(st,x+w/2,98,w/2);
    // 主围脖（波浪带）
    var d='M'+x+' '+(y+4)+' q'+(w*0.25)+' -12 '+(w*0.5)+' 0 q'+(w*0.25)+' 12 '+(w*0.5)+' 0';
    if(ol) s+= '<path d="'+d+'" fill="none" stroke="'+ol+'" stroke-width="'+(20+2*st.ow)+'" stroke-linecap="round"/>';
    s+= '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="20" stroke-linecap="round"/>';
    s+= '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="7" stroke-linecap="round" opacity="0.7"/>';
    // 两垂段 + 流苏
    var ex1=x+6, ex2=x+w-6;
    s+= rrect(ex1-6,y+8,12,40,5,c,ol,st.ow);
    s+= rrect(ex2-6,y+8,12,40,5,c,ol,st.ow);
    var fr=st.ow>0?dk:dk;
    for(var i=0;i<3;i++){ s+='<path d="M'+(ex1-4+i*4)+' '+(y+48)+' l0 9 M'+(ex2-4+i*4)+' '+(y+48)+' l0 9" stroke="'+fr+'" stroke-width="2.2" stroke-linecap="round"/>'; }
    // 织纹
    for(var j=1;j<(lng?6:3);j++){ var fx=Math.round(x+ (w*j/(lng?6:3)) ); s+='<path d="M'+fx+' '+(y-2)+' l0 12" stroke="'+dk+'" stroke-width="2" opacity="0.5"/>'; }
    return s;
  }

  function dCar(cmp,st){
    var lng = cmp==='long';
    var w = lng?158:92, x=18, y=58;
    var c = sat('#4ea3e0',st.s), dk=darken(c,0.28), lt=lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s=''; s+= shadow(st,x+w/2,96,w/2);
    var bw=w, bh=22, cabW=lng?64:42, cabX=x+(bw-cabW)/2;
    if(ol) s+= rrect(x-ol,y-ol,bw+2*ol,bh+2*ol,bh/2,ol,null,0);
    s+= rrect(x,y,bw,bh,bh/2,c,null,0);
    // 车顶
    s+= '<path d="M'+cabX+' '+y+' q10 -22 '+(cabW*0.4)+' -22 h'+(cabW*0.2)+' q'+(cabW*0.3)+' 0 '+(cabW*0.4)+' 22 z" fill="'+(ol?ol:c)+'"/>';
    if(ol) s+= '<path d="M'+cabX+' '+y+' q10 -22 '+(cabW*0.4)+' -22 h'+(cabW*0.2)+' q'+(cabW*0.3)+' 0 '+(cabW*0.4)+' 22 z" fill="'+lt+'"/>';
    else s+= '<path d="M'+cabX+' '+y+' q10 -22 '+(cabW*0.4)+' -22 h'+(cabW*0.2)+' q'+(cabW*0.3)+' 0 '+(cabW*0.4)+' 22 z" fill="'+lt+'"/>';
    // 车窗
    s+= rrect(cabX+8,y-16,cabW-16,14,4,'#dff2ff',null,0);
    // 轮子
    var wy=y+bh, wx1=x+bw*0.26, wx2=x+bw*0.74;
    s+= disc(wx1,wy,11,'#2f3a45',ol,st.ow)+disc(wx1,wy,4.5,'#9fb0bd',null,0);
    s+= disc(wx2,wy,11,'#2f3a45',ol,st.ow)+disc(wx2,wy,4.5,'#9fb0bd',null,0);
    // 车灯
    s+= disc(x+bw-4,y+8,3.2,'#ffe08a',null,0);
    return s;
  }

  function dBanana(cmp,st){
    var lng = cmp==='long';
    var c = sat('#ffd23f',st.s), dk=darken(c,0.3), lt=lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s=''; var w = lng?150:90;
    var x0=24, y0=lng?48:60, x1=x0+w, y1=lng?86:80;
    var d='M'+x0+' '+y0+' Q '+(x0+w*0.5)+' '+(y0+44)+' '+(x1)+' '+(y1-6);
    s+= shadow(st,(x0+x1)/2,104,w/2);
    if(ol) s+= strokeP(d,18+2*st.ow,ol,null,0);
    s+= '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="18" stroke-linecap="round"/>';
    s+= '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="6" stroke-linecap="round" opacity="0.7"/>';
    // 棱线
    s+= '<path d="M'+x0+' '+y0+' Q '+(x0+w*0.5)+' '+(y0+44)+' '+(x1)+' '+(y1-6)+'" fill="none" stroke="'+dk+'" stroke-width="2" opacity="0.5"/>';
    // 蒂
    s+= rrect(x0-4,y0-6,7,10,3,dk,ol,st.ow);
    // 尖
    s+= '<circle cx="'+x1+'" cy="'+(y1-6)+'" r="4" fill="'+dk+'"/>';
    return s;
  }

  function dGiraffe(cmp,st){
    var lng = cmp==='long';
    var c = sat('#f2c14e',st.s), dk=darken(c,0.3), lt=lighten(c,st.l);
    var ol = st.ow>0 ? darken(c,st.oc) : null;
    var s=''; s+= shadow(st,100,108,46);
    var neckTop = lng?18:54;
    // 腿
    s+= rrect(64,86,10,22,4,c,ol,st.ow);
    s+= rrect(120,86,10,22,4,c,ol,st.ow);
    // 身
    s+= disc(96,80,30,c,ol,st.ow);
    s+= rrect(70,72,52,30,16,c,null,0);
    // 颈
    s+= rrect(86,neckTop,16,76-neckTop+8,7,c,ol,st.ow);
    // 头
    var hx=98,hy=neckTop-2;
    s+= disc(hx,hy,15,c,ol,st.ow);
    s+= rrect(hx-2,hy-2,18,12,5,lt,null,0); // 吻
    s+= rrect(hx-12,hy-16,4,10,2,dk,null,0); // 角
    s+= '<circle cx="'+(hx-12)+'" cy="'+(hy-16)+'" r="3" fill="'+dk+'"/>';
    s+= eyes(st,hx-3,hy-2,3)+ (st.eyes==='dot'?'':eyes(st,hx+6,hy-2,3));
    s+= '<circle cx="'+hx+'" cy="'+(hy+4)+'" r="2" fill="#7a4a1e"/>';
    s+= cheeks(st,hx-8,hy+3);
    // 斑点
    var spots=[[80,76],[100,84],[70,90],[108,72],[92,92]];
    spots.forEach(function(p){ s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.5" fill="'+dk+'" opacity="0.55"/>'; });
    // 尾
    s+= '<path d="M126 78 q14 4 12 18" fill="none" stroke="'+c+'" stroke-width="5" stroke-linecap="round"/>';
    s+= '<circle cx="138" cy="98" r="3" fill="'+dk+'"/>';
    return s;
  }

  function dRabbit(cmp,st){
    var lng = cmp==='long';
    var c = sat('#f6f1ea',st.s), dk=darken(c,0.14), lt='#f8d7e0', ol = st.ow>0 ? '#cbb9a8' : null;
    var s=''; s+= shadow(st,100,108,40);
    var earH = lng?40:20;
    // 身
    s+= disc(100,84,26,c,ol,st.ow);
    // 耳
    s+= '<ellipse cx="90" cy="'+(62-earH/2)+'" rx="7" ry="'+(earH/2)+'" fill="'+(ol?ol:c)+'"/>';
    s+= '<ellipse cx="110" cy="'+(62-earH/2)+'" rx="7" ry="'+(earH/2)+'" fill="'+(ol?ol:c)+'"/>';
    s+= '<ellipse cx="90" cy="'+(62-earH/2)+'" rx="3" ry="'+(earH/2-4)+'" fill="'+lt+'"/>';
    s+= '<ellipse cx="110" cy="'+(62-earH/2)+'" rx="3" ry="'+(earH/2-4)+'" fill="'+lt+'"/>';
    // 头
    s+= disc(100,58,20,c,ol,st.ow);
    // 眼鼻
    s+= eyes(st,93,58,3.4)+eyes(st,107,58,3.4);
    s+= '<circle cx="100" cy="64" r="2.6" fill="#e88aa0"/>';
    s+= cheeks(st,88,63);
    // 脚
    s+= disc(86,104,7,c,ol,st.ow)+disc(114,104,7,c,ol,st.ow);
    return s;
  }

  function dTurtle(cmp,st){
    var lng = cmp==='long';
    var shell = sat('#6cbf73',st.s), shellD=darken(shell,0.3), shellL=lighten(shell,st.l);
    var body = sat('#8fd07e',st.s), bodyD=darken(body,0.25);
    var ol = st.ow>0 ? darken(shell,st.oc) : null;
    var s=''; s+= shadow(st,100,106,46);
    var ext = lng?16:6; // 四肢伸出程度
    // 四肢
    s+= disc(64-ext,86,9,body,ol,st.ow);
    s+= disc(136+ext,86,9,body,ol,st.ow);
    s+= disc(64-ext,100,8,body,ol,st.ow);
    s+= disc(136+ext,100,8,body,ol,st.ow);
    // 头
    s+= disc(150+ext,86,12,body,ol,st.ow);
    s+= eyes(st,154+ext,84,3)+ (st.eyes==='dot'?'':eyes(st,150+ext,84,3));
    // 尾
    s+= '<path d="M52 '+(lng?92:88)+' l-'+(ext)+' 4" stroke="'+bodyD+'" stroke-width="4" stroke-linecap="round"/>';
    // 壳
    s+= disc(100,82,34,shell,ol,st.ow);
    s+= '<path d="M100 48 v68 M66 82 h68 M74 56 q26 -10 52 0 M74 108 q26 10 52 0" stroke="'+shellD+'" stroke-width="2.4" fill="none" opacity="0.7"/>';
    s+= disc(100,82,10,shellL,null,0);
    return s;
  }

  /* ---------- 调度 ---------- */
  var DRAW = {
    'snake': dSnake, 'rope': dRope, 'pencil': dPencil, 'bread': dBread,
    'scarf': dScarf, 'car': dCar, 'banana': dBanana,
    'giraffe': dGiraffe, 'rabbit': dRabbit, 'turtle': dTurtle
  };
  var OBJ_KEYS = ['snake','rope','pencil','bread','scarf','car','banana'];
  var ANI_KEYS = ['giraffe','rabbit','turtle'];

  function parseKey(key){
    var p = key.split('.');
    if(p[0]==='LS_OBJECT') return { kind:'obj', name:p[1], cmp:p[2] };
    if(p[0]==='LS_ANIMAL') return { kind:'ani', name:p[1], cmp:p[2] };
    return null;
  }

  function art33(key, style){
    var info = parseKey(key); if(!info) return '';
    var st = STYLE[style] || STYLE[0];
    var fn = DRAW[info.name]; if(!fn) return '';
    var inner = fn(info.cmp, st);
    return '<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" class="art33">'+inner+'</svg>';
  }

  var ALL33 = [];
  OBJ_KEYS.forEach(function(o){ ALL33.push('LS_OBJECT.'+o+'.long','LS_OBJECT.'+o+'.short'); });
  ANI_KEYS.forEach(function(a){ ALL33.push('LS_ANIMAL.'+a+'.long','LS_ANIMAL.'+a+'.short'); });

  var API = { art33: art33, ALL33: ALL33, STYLE: STYLE, parseKey: parseKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ART33 = API;
})(typeof window !== 'undefined' ? window : this);
