/* ============================================================
 * art33.js — 第 3 岛第 3 关（长 / 短）插画生成器
 *
 * 严格遵循 RULES.md：
 *   §二.3 柔和/温柔/温暖 —— 描边只用 2px 白色或浅暖色（禁止粗黑描边），
 *        圆角 ≥16px 等效（全部 rx + round cap），低饱和度粉彩，
 *        顶部暖光高光，禁止冷灰/纯黑。
 *   §二.5 / §二.7 禁止 Emoji 配图，一律内联 SVG。
 *   §二.13 图片资产只用现有图库或手写内联 SVG，严禁调用任何生图 API。
 *
 * 坐标空间 0 0 100 100，返回**内层 markup**（无 <svg> 外壳），
 * 可直接注入游戏既有的 <svg viewBox="0 0 100 100">，是 lsObjectSVG /
 * lsAnimalSVG 的即插即用替身。
 *
 * 3 套画风（全部合规，仅风格语言不同）：
 *   0 柔光卡通：粉彩 + 白色细描边 + 暖光高光 + 大眼 + 腮红
 *   1 奶油扁平：无描边 + 双色扁等等 + 点眼
 *   2 暖阳手绘：浅暖色细描边 + 柔光 + 软眼
 *
 * 真实素材清单（与游戏出题逻辑一一对应，共 17 张）：
 *   LS_OBJECT.{snake,rope,pencil,bread,scarf,car,banana}.{long,short}  = 14
 *   LS_ANIMAL.{giraffe,rabbit,turtle}                                   = 3
 *   （动物的「长」由物种体现：长颈鹿长脖 / 兔子长耳 = 长；乌龟矮短 = 短）
 * ============================================================ */
(function (root) {
  'use strict';

  /* ---------- 颜色工具（全部保持低饱和暖调） ---------- */
  function hx(h){ h=(h||'#000').replace('#',''); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
  function tohex(a){ return '#'+a.map(function(v){ v=Math.max(0,Math.min(255,Math.round(v))); return ('0'+v.toString(16)).slice(-2); }).join(''); }
  function mix(c1,c2,t){ var a=hx(c1),b=hx(c2); return tohex(a.map(function(v,i){ return v+(b[i]-v)*t; })); }
  function lighten(c,t){ return mix(c,'#ffffff',t); }
  function darken(c,t){ return mix(c,'#000000',t); }
  function sat(c,s){ var a=hx(c); var g=(a[0]*0.299+a[1]*0.587+a[2]*0.114); return s>=1 ? c : mix(tohex([g,g,g]), c, s); }

  var EYE = '#8A7566';      // 暖褐眼（非纯黑）
  var BLUSH = '#F3B9C0';    // 腮红
  var TONGUE = '#F19DB0';

  /* ---------- 画风 ---------- */
  var STYLE = [
    { key:'cute', name:'柔光卡通', desc:'粉彩·白描边·暖光高光', ow:2.0, oc:'#FFFDF8', eyes:'cute', cheek:true,  hi:0.60, s:1.00, l:0.10 },
    { key:'flat', name:'奶油扁平', desc:'无描边·双色扁等等',     ow:0,   oc:null,       eyes:'dot',  cheek:false, hi:0.00, s:1.00, l:0.18 },
    { key:'warm', name:'暖阳手绘', desc:'浅暖细描边·柔光',       ow:1.5, oc:'#F0DECD', eyes:'soft', cheek:true,  hi:0.42, s:0.90, l:0.14 }
  ];

  /* ---------- 基础图元 ---------- */
  function disc(cx,cy,r,fill,ol,olw){
    var s=''; if(ol) s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(r+(olw||1.5))+'" fill="'+ol+'"/>';
    return s+'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"/>';
  }
  function rrect(x,y,w,h,r,fill,ol,olw){
    var o=olw||1.5, s='';
    if(ol) s+='<rect x="'+(x-o)+'" y="'+(y-o)+'" width="'+(w+2*o)+'" height="'+(h+2*o)+'" rx="'+(r+o)+'" fill="'+ol+'"/>';
    return s+'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'"/>';
  }
  function ell(cx,cy,rx,ry,fill,ol,olw){
    var o=olw||1.5, s='';
    if(ol) s+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+(rx+o)+'" ry="'+(ry+o)+'" fill="'+ol+'"/>';
    return s+'<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+fill+'"/>';
  }
  function strokeP(d,w,fill,ol,olw,cap){
    var o=olw||1.5, s=''; cap=cap||'round';
    if(ol) s+='<path d="'+d+'" fill="none" stroke="'+ol+'" stroke-width="'+(w+2*o)+'" stroke-linecap="'+cap+'" stroke-linejoin="round"/>';
    return s+'<path d="'+d+'" fill="none" stroke="'+fill+'" stroke-width="'+w+'" stroke-linecap="'+cap+'" stroke-linejoin="round"/>';
  }
  function eyes(st,x,y,r){
    if(st.eyes==='cute') return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#ffffff"/>'+
      '<circle cx="'+x+'" cy="'+(y+r*0.1)+'" r="'+(r*0.6)+'" fill="'+EYE+'"/>'+
      '<circle cx="'+(x-r*0.24)+'" cy="'+(y-r*0.26)+'" r="'+(r*0.26)+'" fill="#ffffff"/>';
    if(st.eyes==='dot') return '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.55)+'" fill="'+EYE+'"/>';
    return '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.72)+'" fill="'+EYE+'"/>'+
      '<circle cx="'+(x-r*0.2)+'" cy="'+(y-r*0.22)+'" r="'+(r*0.24)+'" fill="#ffffff"/>';
  }
  function cheeks(st,x,y){
    if(!st.cheek) return '';
    return '<circle cx="'+x+'" cy="'+y+'" r="2.8" fill="'+BLUSH+'" opacity="0.55"/>'+
           '<circle cx="'+(x+11)+'" cy="'+y+'" r="2.8" fill="'+BLUSH+'" opacity="0.55"/>';
  }
  function hi(st,cx,cy,rx,ry){
    if(!st.hi) return '';
    return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="#ffffff" opacity="'+st.hi+'"/>';
  }
  function smile(x,y,w){
    return '<path d="M'+x+' '+y+' q'+(w/2)+' '+(w*0.55)+' '+w+' 0" fill="none" stroke="'+EYE+'" stroke-width="1.8" stroke-linecap="round"/>';
  }

  /* ================= 物体（长 / 短） ================= */
  function dSnake(cmp,st){
    var L = cmp==='long';
    var c = sat('#A9D8A6',st.s), lt = lighten(c,st.l), dk = darken(c,0.22);
    var ol = st.ow>0 ? st.oc : null;
    var x0 = L?8:30, x1 = L?84:72, cy = L?70:66, w = L?13:12;
    var d = 'M'+x0+' '+(cy+4)+' C '+(x0+14)+' '+(cy-20)+', '+(x0+26)+' '+(cy-20)+', '+(x0+34)+' '+(cy-6)+
            ' C '+(x0+42)+' '+(cy+6)+', '+(x1-20)+' '+(cy+6)+', '+(x1-8)+' '+(cy-4);
    var s = '';
    if(ol) s += strokeP(d,w+2*st.ow,ol,null,0);
    s += '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="'+(w*0.34)+'" stroke-linecap="round" opacity="0.75"/>';
    // 背纹
    var n = L?5:3;
    for(var i=1;i<=n;i++){ var t=i/(n+1); var bx=Math.round(x0+(x1-x0)*t);
      s += '<circle cx="'+bx+'" cy="'+(cy-2)+'" r="2" fill="'+dk+'" opacity="0.45"/>'; }
    // 头
    s += disc(x1,cy-4,10,c,ol,st.ow);
    s += hi(st,x1-3,cy-8,4.5,3.2);
    s += eyes(st,x1-4,cy-6,2.6)+eyes(st,x1+4,cy-6,2.6);
    s += smile(x1-4,cy+1,8);
    s += cheeks(st,x1-7,cy+1);
    s += '<path d="M'+(x1+9)+' '+(cy-4)+' l7 -2.6 -7 -2.6 z" fill="'+TONGUE+'"/>';
    return s;
  }

  function dRope(cmp,st){
    var L = cmp==='long';
    var c = sat('#E7CFAA',st.s), lt = lighten(c,st.l), dk = darken(c,0.24);
    var ol = st.ow>0 ? st.oc : null;
    var x0 = L?10:32, x1 = L?90:68, y=54, w=14;
    var d='M'+x0+' '+y+' C '+(x0+18)+' '+(y-12)+', '+(x0+36)+' '+(y+14)+', '+(x0+54)+' '+y+
          ' C '+(x0+66)+' '+(y-9)+', '+(x1-10)+' '+(y-9)+', '+x1+' '+y;
    var s='';
    if(ol) s += strokeP(d,w+2*st.ow,ol,null,0);
    s += '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="'+(w*0.3)+'" stroke-linecap="round" opacity="0.8"/>';
    var n = L?6:3;
    for(var i=1;i<=n;i++){ var t=i/(n+1); var bx=Math.round(x0+(x1-x0)*t);
      s += '<path d="M'+(bx-5)+' '+(y-4)+' l4 8 M'+(bx+1)+' '+(y-4)+' l4 8" stroke="'+dk+'" stroke-width="2" stroke-linecap="round" opacity="0.6"/>'; }
    s += '<circle cx="'+x0+'" cy="'+y+'" r="5" fill="'+dk+'"/>';
    s += '<path d="M'+(x1-1)+' '+(y-5)+' l6 -3 M'+x1+' '+y+' l7 0 M'+(x1-1)+' '+(y+5)+' l6 3" stroke="'+dk+'" stroke-width="2" stroke-linecap="round"/>';
    return s;
  }

  function dPencil(cmp,st){
    var L = cmp==='long';
    var c = sat('#FBE3A2',st.s), lt = lighten(c,st.l);
    var wood='#F0D3AE', woodD=darken(wood,0.18), graph='#B9A79A', era='#F6BCC8', eraD=darken(era,0.18);
    var ol = st.ow>0 ? st.oc : null;
    var y=52, h=16, bw = L?54:24, bx = L?16:40;
    var s='';
    s += rrect(bx-8,y,8,h,h/2,era,ol,st.ow);
    s += rrect(bx-2,y,3,h,1.2,eraD,null,0);
    s += rrect(bx,y,bw,h,h/2,c,ol,st.ow);
    s += rrect(bx,y,bw,h*0.42,h/2,lt,null,0);
    var tx = bx+bw;
    if(ol) s += '<path d="M'+tx+' '+y+' l14 8 -14 8 z" fill="'+ol+'"/>';
    s += '<path d="M'+tx+' '+y+' l14 8 -14 8 z" fill="'+wood+'"/>';
    s += '<path d="M'+(tx+7)+' '+(y+4)+' l7 4 -7 4 z" fill="'+graph+'"/>';
    s += hi(st,bx+bw*0.4,y+3,bw*0.28,2);
    return s;
  }

  function dBread(cmp,st){
    var c = sat('#F1D3A2',st.s), lt = lighten(c,st.l), dk = darken(c,0.22);
    var ol = st.ow>0 ? st.oc : null;
    var s='';
    if(cmp==='long'){
      var x=10,y=44,w=80,h=22;
      s += rrect(x,y,w,h,h/2,c,ol,st.ow);
      s += rrect(x,y,w,h*0.44,h/2,lt,null,0);
      for(var i=1;i<=5;i++){ var sx=Math.round(x+12+i*13);
        s += '<path d="M'+sx+' '+(y+7)+' l-5 11" stroke="'+dk+'" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>'; }
      s += hi(st,x+w*0.3,y+4,14,3);
    } else {
      s += disc(50,55,21,c,ol,st.ow);
      s += '<circle cx="50" cy="55" r="21" fill="none" stroke="'+lt+'" stroke-width="5"/>';
      s += '<path d="M40 53 q10 10 20 0" stroke="'+dk+'" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.55"/>';
      s += hi(st,43,47,6,4);
    }
    return s;
  }

  function dScarf(cmp,st){
    var L = cmp==='long';
    var c = sat('#F6BCC6',st.s), lt = lighten(c,st.l), dk = darken(c,0.2);
    var ol = st.ow>0 ? st.oc : null;
    var w = L?74:34, x = 13, y=46;
    var d='M'+x+' '+(y+3)+' q'+(w*0.25)+' -10 '+(w*0.5)+' 0 q'+(w*0.25)+' 10 '+(w*0.5)+' 0';
    var s='';
    if(ol) s += '<path d="'+d+'" fill="none" stroke="'+ol+'" stroke-width="'+(18+2*st.ow)+'" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="18" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="6" stroke-linecap="round" opacity="0.8"/>';
    var e1=x+4, e2=x+w-4, hangH = L?26:14;
    s += rrect(e1-5,y+6,10,hangH,5,c,ol,st.ow);
    s += rrect(e2-5,y+6,10,hangH,5,c,ol,st.ow);
    for(var i=0;i<3;i++){
      s += '<path d="M'+(e1-3+i*3)+' '+(y+6+hangH)+' l0 7 M'+(e2-3+i*3)+' '+(y+6+hangH)+' l0 7" stroke="'+dk+'" stroke-width="2" stroke-linecap="round"/>';
    }
    var n = L?5:2;
    for(var j=1;j<=n;j++){ var fx=Math.round(x+w*j/(n+1));
      s += '<path d="M'+fx+' '+(y-2)+' l0 9" stroke="'+dk+'" stroke-width="1.8" opacity="0.45"/>'; }
    return s;
  }

  function dCar(cmp,st){
    var L = cmp==='long';
    var c = sat('#AFD3EA',st.s), lt = lighten(c,st.l);
    var ol = st.ow>0 ? st.oc : null;
    var w = L?76:44, x = 12, y=58, h=18;
    var s='';
    var cabW = L?58:32, cabX = x+(w-cabW)/2;
    s += rrect(x,y,w,h,h/2,c,ol,st.ow);
    var cd='M'+cabX+' '+y+' q9 -18 '+(cabW*0.38)+' -18 h'+(cabW*0.24)+' q'+(cabW*0.32)+' 0 '+(cabW*0.38)+' 18 z';
    if(ol) s += '<path d="'+cd+'" fill="'+ol+'"/>';
    s += '<path d="'+cd+'" fill="'+lt+'"/>';
    s += rrect(cabX+7,y-14,cabW-14,12,4,'#FBFEFE',null,0);
    var wy=y+h, wx1=x+w*0.27, wx2=x+w*0.73;
    s += disc(wx1,wy,10,'#D8CFC6',ol,st.ow)+disc(wx1,wy,4,'#F6F1EA',null,0);
    s += disc(wx2,wy,10,'#D8CFC6',ol,st.ow)+disc(wx2,wy,4,'#F6F1EA',null,0);
    s += disc(x+w-3,y+7,2.8,'#FCE9A8',null,0);
    s += hi(st,x+w*0.28,y+3,12,2.4);
    return s;
  }

  function dBanana(cmp,st){
    var L = cmp==='long';
    var c = sat('#F9E39C',st.s), lt = lighten(c,st.l), dk = darken(c,0.24);
    var ol = st.ow>0 ? st.oc : null;
    var x0=20, y0=L?40:52, x1=L?86:74, y1=L?74:66;
    var d='M'+x0+' '+y0+' Q '+(x0+(x1-x0)*0.5)+' '+(y0+40)+' '+x1+' '+(y1-6);
    var s='';
    if(ol) s += strokeP(d,17+2*st.ow,ol,null,0);
    s += '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="17" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+lt+'" stroke-width="5.5" stroke-linecap="round" opacity="0.85"/>';
    s += '<path d="M'+x0+' '+y0+' Q '+(x0+(x1-x0)*0.5)+' '+(y0+40)+' '+x1+' '+(y1-6)+'" fill="none" stroke="'+dk+'" stroke-width="1.6" opacity="0.4"/>';
    s += rrect(x0-4,y0-6,6,9,3,dk,ol,st.ow);
    s += '<circle cx="'+x1+'" cy="'+(y1-6)+'" r="3.4" fill="'+dk+'"/>';
    return s;
  }

  /* ================= 动物（物种即长短） ================= */
  function dGiraffe(st){
    var c = sat('#F3DCA0',st.s), lt = lighten(c,st.l), dk = darken(c,0.24);
    var ol = st.ow>0 ? st.oc : null;
    var s='';
    s += rrect(58,84,8,16,4,c,ol,st.ow);              // 腿
    s += rrect(74,84,8,16,4,c,ol,st.ow);
    s += ell(68,74,22,15,c,ol,st.ow);                 // 身
    s += rrect(50,26,15,52,7,c,ol,st.ow);             // 长脖
    s += ell(60,22,11,9,c,ol,st.ow);                  // 头
    s += rrect(58,19,16,9,4.5,lt,null,0);             // 吻部
    s += rrect(50,10,3,8,1.5,dk,null,0);              // 角
    s += '<circle cx="50" cy="10" r="2.6" fill="'+dk+'"/>';
    s += eyes(st,57,20,2.4)+ (st.eyes==='dot'?'':eyes(st,64,20,2.4));
    s += '<circle cx="60" cy="26" r="1.8" fill="'+EYE+'"/>';
    s += cheeks(st,52,24);
    [[60,70],[76,74],[64,80],[80,68],[72,62]].forEach(function(p){
      s += '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.6" fill="'+dk+'" opacity="0.5"/>'; });
    s += '<path d="M90 72 q12 4 10 16" fill="none" stroke="'+c+'" stroke-width="4.5" stroke-linecap="round"/>';
    s += '<circle cx="100" cy="90" r="2.8" fill="'+dk+'"/>';
    s += hi(st,56,16,5,3);
    return s;
  }

  function dRabbit(st){
    var c = sat('#FBF3E9',st.s), lt='#F8D9E0';
    var ol = st.ow>0 ? st.oc : null;
    var s='';
    s += ell(42,26,6,20,c,ol,st.ow);                  // 长耳
    s += ell(58,26,6,20,c,ol,st.ow);
    s += ell(42,27,2.6,15,lt,null,0);
    s += ell(58,27,2.6,15,lt,null,0);
    s += ell(50,72,20,17,c,ol,st.ow);                 // 身
    s += disc(50,50,15,c,ol,st.ow);                   // 头
    s += eyes(st,44,49,3)+eyes(st,56,49,3);
    s += '<circle cx="50" cy="55" r="2.4" fill="#F0A9BC"/>';
    s += smile(46,58,8);
    s += cheeks(st,39,54);
    s += disc(34,84,6,c,ol,st.ow)+disc(66,84,6,c,ol,st.ow);
    s += hi(st,44,42,5,3.4);
    return s;
  }

  function dTurtle(st){
    var shell = sat('#BCDBA8',st.s), shellD=darken(shell,0.26), shellL=lighten(shell,st.l);
    var body = sat('#D6EBC6',st.s);
    var ol = st.ow>0 ? st.oc : null;
    var s='';
    s += disc(40,72,7,body,ol,st.ow);                 // 短四肢
    s += disc(78,72,7,body,ol,st.ow);
    s += disc(40,86,6.5,body,ol,st.ow);
    s += disc(78,86,6.5,body,ol,st.ow);
    s += disc(84,70,10,body,ol,st.ow);                // 头（右侧，短）
    s += eyes(st,88,67,2.4)+ (st.eyes==='dot'?'':eyes(st,82,67,2.4));
    s += smile(84,74,7);
    s += '<path d="M28 78 l-8 3" stroke="'+darken(body,0.2)+'" stroke-width="4" stroke-linecap="round"/>';
    s += disc(56,70,26,shell,ol,st.ow);               // 壳（矮圆 = 短）
    s += '<path d="M56 44 v52 M34 70 h44 M40 52 q16 -8 32 0 M40 88 q16 8 32 0" stroke="'+shellD+'" stroke-width="2" fill="none" opacity="0.6"/>';
    s += disc(56,70,9,shellL,null,0);
    s += hi(st,48,54,8,5);
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

  var ALL17 = [];
  OBJ_KEYS.forEach(function(o){ ALL17.push('LS_OBJECT.'+o+'.long','LS_OBJECT.'+o+'.short'); });
  ANI_KEYS.forEach(function(a){ ALL17.push('LS_ANIMAL.'+a); });

  function parseKey(key){
    var p = key.split('.');
    if(p[0]==='LS_OBJECT') return { kind:'obj', name:p[1], cmp:p[2] };
    if(p[0]==='LS_ANIMAL') return { kind:'ani', name:p[1], cmp:null };
    return null;
  }

  /* 返回内层 markup（0 0 100 100），可直接注入游戏既有 <svg> */
  function art33(key, style){
    var info = parseKey(key); if(!info) return '';
    var st = STYLE[style] || STYLE[0];
    var fn = DRAW[info.name]; if(!fn) return '';
    return (info.kind==='obj') ? fn(info.cmp, st) : fn(st);
  }

  var API = {
    art33: art33, ALL17: ALL17, STYLE: STYLE, parseKey: parseKey,
    OBJ_KEYS: OBJ_KEYS, ANI_KEYS: ANI_KEYS,
    wrap: function(inner){ return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" class="art33">'+inner+'</svg>'; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ART33 = API;
})(typeof window !== 'undefined' ? window : this);
