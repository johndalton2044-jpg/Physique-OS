/* ============================================================================
   THE REMAINING CHART TYPES (H4)
   Every catalogued chart type now has a renderer. Each enforces the requirement its catalogue entry states \u2014 a
   sankey whose flows are not conserved, a violin with too few values, a funnel whose stages grow, a candlestick whose
   high is below its close \u2014 and refuses with the reason rather than draw something that misleads. Series are the
   accent at stepped strengths with a stroke or dash pattern, named in a legend, so they read without colour; every mark
   carries a text title.
   ============================================================================ */
var _CX={W:320,H:170,pad:30};
function _cxRefuse(type,why){return '<div class="hint chart-refused" data-chart="'+attrEsc(type)+'">Not drawn \u2014 '+esc(why)+'.</div>';}
function _cxSvg(pm,W,H,body,extra){return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'chart')+'">'+body+'</svg>'+(extra||'');}
function _cxT(s){return '<title>'+esc(s)+'</title>';}
function _cxLegend(names){return '<div class="hx-key">'+names.map(function(n,i){return '<span><i class="k-sb'+(i%4)+'"></i>'+esc(n)+'</span>';}).join('')+'</div>';}
function _cxFmt(v){return fmtNum(v,Math.abs(v)>=100?0:1);}   /* 4,128 steps, not 4,128.0 */
function _cxNum(v){return typeof v==='number'&&isFinite(v);}
function _cxScale(lo,hi,a,b){return function(v){return hi===lo?(a+b)/2:a+(b-a)*(v-lo)/(hi-lo);};}
function _kde(values,bw,lo,hi,n){var out=[],N=values.length;for(var i=0;i<n;i++){var x=lo+(hi-lo)*i/(n-1),s=0;
  values.forEach(function(v){var u=(x-v)/bw;s+=Math.exp(-0.5*u*u);});out.push({x:x,y:s/(N*bw*Math.sqrt(2*Math.PI))});}return out;}
function _silverman(v){var s=sd(v),q=v.slice().sort(function(a,b){return a-b;}),iqr=q[Math.floor(q.length*0.75)]-q[Math.floor(q.length*0.25)];
  var m=Math.min(s,iqr/1.34||s);return 0.9*m*Math.pow(v.length,-0.2)||1;}

/* groupedBar: categories[], series[{name,values[]}] */
CHART_RENDERERS.groupedBar=function(pm){var C=pm.categories||[],S=pm.series||[];if(!C.length||!S.length)return _cxRefuse('groupedBar','nothing to compare');
  var all=[];S.forEach(function(s){s.values.forEach(function(v){if(_cxNum(v))all.push(v);});});var mx=Math.max.apply(null,all.concat([0])),mn=Math.min.apply(null,all.concat([0]));
  var W=_CX.W,H=_CX.H,y=_cxScale(mn,mx||1,H-20,10),gw=(W-_CX.pad)/C.length,bw=Math.max(3,(gw-6)/S.length),out='<line class="tl-axis" x1="'+_CX.pad+'" x2="'+W+'" y1="'+y(0)+'" y2="'+y(0)+'"/>';
  C.forEach(function(c,i){S.forEach(function(s,si){var v=s.values[i];if(!_cxNum(v))return;var x=_CX.pad+i*gw+3+si*bw,y0=y(0),y1=y(v);
      out+='<rect class="sb-s'+(si%4)+'" x="'+x.toFixed(1)+'" y="'+Math.min(y0,y1).toFixed(1)+'" width="'+(bw-1).toFixed(1)+'" height="'+Math.abs(y1-y0).toFixed(1)+'">'+_cxT(c+' \u00b7 '+s.name+': '+fmtNum(v,1))+'</rect>';});
    out+='<text class="hm-lab" x="'+(_CX.pad+i*gw+gw/2)+'" y="'+(H-4)+'" text-anchor="middle">'+esc(c)+'</text>';});
  return _cxSvg(pm,W,H,out,_cxLegend(S.map(function(s){return s.name;})));};

/* bubble: points[{x,y,size,label}] \u2014 the third variable as AREA, not radius */
CHART_RENDERERS.bubble=function(pm){var P=(pm.points||[]).filter(function(p){return _cxNum(p.x)&&_cxNum(p.y)&&_cxNum(p.size)&&p.size>=0;});
  if(P.length<(CHART_TYPES.bubble.minObservations||5))return _cxRefuse('bubble','it needs at least '+(CHART_TYPES.bubble.minObservations||5)+' points with all three values');
  var xs=P.map(function(p){return p.x;}),ys=P.map(function(p){return p.y;}),ss=P.map(function(p){return p.size;}),W=_CX.W,H=_CX.H;
  var X=_cxScale(Math.min.apply(null,xs),Math.max.apply(null,xs),_CX.pad+18,W-22),Y=_cxScale(Math.min.apply(null,ys),Math.max.apply(null,ys),H-30,22),smax=Math.max.apply(null,ss)||1,out='',placed=[];
  P.slice().sort(function(a,b){return b.size-a.size;}).forEach(function(p){var r=Math.sqrt(p.size/smax)*14+1.5;out+='<circle class="cx-bub" cx="'+X(p.x).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="'+r.toFixed(1)+'">'+_cxT((p.label?p.label+': ':'')+(pm.xLabel||'x')+' '+fmtNum(p.x,1)+', '+(pm.yLabel||'y')+' '+fmtNum(p.y,1)+', '+(pm.sizeLabel||'size')+' '+fmtNum(p.size,1))+'</circle>'+
    (function(){if(!p.label)return '';var t=String(p.label).slice(0,14),w=t.length*5.6,x=X(p.x);
      /* Below the bubble, else above it, else left out: every name stays in the bubble's title. */
      var tries=[Y(p.y)+r+9,Y(p.y)-r-4];for(var k=0;k<tries.length;k++){var bx={x0:x-w/2,x1:x+w/2,y0:tries[k]-8,y1:tries[k]+2};
        if(bx.x0<0||bx.x1>W||placed.some(function(q){return !(bx.x1<q.x0||bx.x0>q.x1||bx.y1<q.y0||bx.y0>q.y1);}))continue;
        placed.push(bx);return '<text class="hm-lab cx-halo" x="'+x.toFixed(1)+'" y="'+tries[k].toFixed(1)+'" text-anchor="middle">'+esc(t)+'</text>';}
      return '';})();});
  out+='<text class="hm-lab" x="'+(W-4)+'" y="'+(H-4)+'" text-anchor="end">'+esc(pm.xLabel||'')+'</text><text class="hm-lab" x="2" y="10">'+esc(pm.yLabel||'')+'</text>';
  return _cxSvg(pm,W,H,out,'<div class="hint">Circle area is proportional to '+esc(pm.sizeLabel||'the third value')+'.</div>');};

/* density: values[], bandwidth (stated; Silverman's rule when not given, and said so) */
CHART_RENDERERS.density=function(pm){var V=(pm.values||[]).filter(_cxNum),min=CHART_TYPES.density.minObservations||20;
  if(V.length<min)return _cxRefuse('density','a distribution\u2019s shape needs at least '+min+' values; there are '+V.length);
  var bw=pm.bandwidth||_silverman(V),lo=Math.min.apply(null,V)-2*bw,hi=Math.max.apply(null,V)+2*bw,D=_kde(V,bw,lo,hi,60),W=_CX.W,H=140;
  var X=_cxScale(lo,hi,_CX.pad,W-6),Y=_cxScale(0,Math.max.apply(null,D.map(function(d){return d.y;})),H-18,8);
  var path='M'+X(lo)+' '+Y(0)+D.map(function(d){return 'L'+X(d.x).toFixed(1)+' '+Y(d.y).toFixed(1);}).join('')+'L'+X(hi)+' '+Y(0)+'Z';
  var out='<path class="cx-area" d="'+path+'">'+_cxT('estimated density of '+V.length+' values')+'</path>'+V.map(function(v){return '<line class="cx-rug" x1="'+X(v).toFixed(1)+'" x2="'+X(v).toFixed(1)+'" y1="'+(H-18)+'" y2="'+(H-13)+'"/>';}).join('')+
    '<text class="hm-lab" x="'+_CX.pad+'" y="'+(H-2)+'">'+esc(_cxFmt(Math.min.apply(null,V)))+'</text><text class="hm-lab" x="'+(W-6)+'" y="'+(H-2)+'" text-anchor="end">'+esc(_cxFmt(Math.max.apply(null,V)))+'</text>';
  return _cxSvg(pm,W,H,out,'<div class="hint">Smoothing bandwidth '+fmtNum(bw,2)+(pm.bandwidth?'':' (Silverman\u2019s rule)')+'; each tick is one value.</div>');};

/* violin: groups[{name,values[]}], each with enough values */
CHART_RENDERERS.violin=function(pm){var G=pm.groups||[],min=CHART_TYPES.violin.minObservations||20;
  var short=G.filter(function(g){return (g.values||[]).filter(_cxNum).length<min;});if(!G.length||short.length)return _cxRefuse('violin','each group needs at least '+min+' values'+(short.length?(' ('+short.map(function(g){return g.name;}).join(', ')+' has fewer)'):''));
  var all=[];G.forEach(function(g){all=all.concat(g.values.filter(_cxNum));});var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all),W=_CX.W,H=_CX.H,Y=_cxScale(lo,hi,H-20,10),gw=(W-_CX.pad)/G.length,out='';
  G.forEach(function(g,i){var v=g.values.filter(_cxNum),bw=_silverman(v),D=_kde(v,bw,lo,hi,40),mx=Math.max.apply(null,D.map(function(d){return d.y;}))||1,cx=_CX.pad+i*gw+gw/2,hw=gw*0.42;
    var L=D.map(function(d){return (cx-hw*d.y/mx).toFixed(1)+' '+Y(d.x).toFixed(1);}),R=D.slice().reverse().map(function(d){return (cx+hw*d.y/mx).toFixed(1)+' '+Y(d.x).toFixed(1);});
    var med=median(v);out+='<path class="cx-area" d="M'+L.join('L')+'L'+R.join('L')+'Z">'+_cxT(g.name+': '+v.length+' values, median '+fmtNum(med,1))+'</path><line class="cx-med" x1="'+(cx-hw*0.5)+'" x2="'+(cx+hw*0.5)+'" y1="'+Y(med)+'" y2="'+Y(med)+'"/>'+
      '<text class="hm-lab" x="'+cx+'" y="'+(H-4)+'" text-anchor="middle">'+esc(g.name)+'</text>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Width shows how common each value is; the line is the median.</div>');};

/* ridgeline: groups[{name,values[]}] \u2014 shared x axis, each with enough values */
CHART_RENDERERS.ridgeline=function(pm){var G=pm.groups||[],min=CHART_TYPES.ridgeline.minObservations||20;
  if(!G.length||G.some(function(g){return (g.values||[]).filter(_cxNum).length<min;}))return _cxRefuse('ridgeline','each group needs at least '+min+' values on a shared axis');
  var all=[];G.forEach(function(g){all=all.concat(g.values.filter(_cxNum));});var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all),W=_CX.W,rh=26,H=G.length*rh+30,X=_cxScale(lo,hi,70,W-6),out='';
  G.forEach(function(g,i){var v=g.values.filter(_cxNum),D=_kde(v,_silverman(v),lo,hi,50),mx=Math.max.apply(null,D.map(function(d){return d.y;}))||1,base=20+(i+1)*rh;
    out+='<path class="cx-area" d="M'+X(lo)+' '+base+D.map(function(d){return 'L'+X(d.x).toFixed(1)+' '+(base-rh*1.4*d.y/mx).toFixed(1);}).join('')+'L'+X(hi)+' '+base+'Z">'+_cxT(g.name+': '+v.length+' values')+'</path><text class="hm-lab" x="0" y="'+(base-2)+'">'+esc(g.name)+'</text>';});
  out+='<text class="hm-lab" x="70" y="'+(H-2)+'">'+esc(_cxFmt(lo))+'</text><text class="hm-lab" x="'+(W-6)+'" y="'+(H-2)+'" text-anchor="end">'+esc(_cxFmt(hi))+'</text>';
  return _cxSvg(pm,W,H,out);};

/* radar: axes[{name,value,max}] \u2014 each axis scaled to its own stated maximum, and said so */
CHART_RENDERERS.radar=function(pm){var A=(pm.axes||[]).filter(function(a){return _cxNum(a.value)&&_cxNum(a.max)&&a.max>0;});
  if(A.length<3)return _cxRefuse('radar','it needs at least three measures, each with a stated maximum');
  var W=_CX.W,H=200,cx=W/2,cy=H/2+4,R=70,n=A.length,pt=function(i,f){var a=-Math.PI/2+2*Math.PI*i/n;return [cx+R*f*Math.cos(a),cy+R*f*Math.sin(a)];},out='';
  [0.5,1].forEach(function(f){out+='<polygon class="cx-grid" points="'+A.map(function(a,i){return pt(i,f).map(function(v){return v.toFixed(1);}).join(',');}).join(' ')+'"/>';});
  A.forEach(function(a,i){var e=pt(i,1),l=pt(i,1.22);out+='<line class="cx-grid" x1="'+cx+'" y1="'+cy+'" x2="'+e[0].toFixed(1)+'" y2="'+e[1].toFixed(1)+'"/><text class="hm-lab" x="'+l[0].toFixed(1)+'" y="'+l[1].toFixed(1)+'" text-anchor="middle">'+esc(a.name)+'</text>';});
  out+='<polygon class="cx-area" points="'+A.map(function(a,i){return pt(i,Math.max(0,Math.min(1,a.value/a.max))).map(function(v){return v.toFixed(1);}).join(',');}).join(' ')+'">'+_cxT(A.map(function(a){return a.name+' '+fmtNum(a.value,1)+' of '+fmtNum(a.max,1);}).join('; '))+'</polygon>';
  return _cxSvg(pm,W,H,out,'<div class="hint">Each axis runs from zero to its own maximum, so the shape compares shares of each maximum, not raw amounts.</div>');};

/* polar: bins[{label,value}] \u2014 only for a genuine cycle (7 days, 12 months, 24 hours) */
CHART_RENDERERS.polar=function(pm){var B=(pm.bins||[]).filter(function(b){return _cxNum(b.value)&&b.value>=0;});
  if([7,12,24].indexOf(B.length)<0)return _cxRefuse('polar','a polar chart is only for a genuine cycle \u2014 7 days, 12 months or 24 hours; this has '+B.length+' parts');
  var W=_CX.W,H=210,cx=W/2,cy=H/2,R=80,mx=Math.max.apply(null,B.map(function(b){return b.value;}))||1,n=B.length,out='';
  B.forEach(function(b,i){var a0=-Math.PI/2+2*Math.PI*i/n,a1=a0+2*Math.PI/n,r=R*Math.sqrt(b.value/mx),p=function(a,rr){return (cx+rr*Math.cos(a)).toFixed(1)+' '+(cy+rr*Math.sin(a)).toFixed(1);};
    out+='<path class="cx-wedge" d="M'+cx+' '+cy+'L'+p(a0,r)+'A'+r.toFixed(1)+' '+r.toFixed(1)+' 0 0 1 '+p(a1,r)+'Z">'+_cxT(b.label+': '+fmtNum(b.value,1))+'</path>';
    var am=(a0+a1)/2;out+='<text class="hm-lab" x="'+(cx+(R+10)*Math.cos(am)).toFixed(1)+'" y="'+(cy+(R+10)*Math.sin(am)+3).toFixed(1)+'" text-anchor="middle">'+esc(b.label)+'</text>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Wedge area, not length, is proportional to the value.</div>');};

/* donut: parts[{name,value}] \u2014 parts of one whole, total in the centre */
CHART_RENDERERS.donut=function(pm){var P=(pm.parts||[]).filter(function(p){return _cxNum(p.value);});
  if(P.length<2||P.some(function(p){return p.value<0;}))return _cxRefuse('donut','it needs at least two non-negative parts of one whole');
  var tot=P.reduce(function(a,p){return a+p.value;},0);if(!tot)return _cxRefuse('donut','the parts add up to nothing');
  if(pm.total!=null&&Math.abs(tot-pm.total)>Math.max(1,pm.total*0.01))return _cxRefuse('donut','the parts ('+fmtNum(tot,0)+') do not add up to the stated whole ('+fmtNum(pm.total,0)+')');
  var W=_CX.W,H=180,cx=W/2-50,cy=H/2,R=70,r=44,a=-Math.PI/2,out='';
  P.forEach(function(p,i){var a1=a+2*Math.PI*p.value/tot,lg=(a1-a)>Math.PI?1:0,pt=function(ang,rr){return (cx+rr*Math.cos(ang)).toFixed(1)+' '+(cy+rr*Math.sin(ang)).toFixed(1);};
    out+='<path class="sb-s'+(i%4)+'" d="M'+pt(a,R)+'A'+R+' '+R+' 0 '+lg+' 1 '+pt(a1,R)+'L'+pt(a1,r)+'A'+r+' '+r+' 0 '+lg+' 0 '+pt(a,r)+'Z">'+_cxT(p.name+': '+fmtNum(p.value,0)+' ('+Math.round(p.value/tot*100)+'%)')+'</path>';a=a1;});
  out+='<text class="cx-big" x="'+cx+'" y="'+(cy+2)+'" text-anchor="middle">'+esc(fmtNum(tot,0))+'</text>'+(pm.unit?'<text class="hm-lab" x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle">'+esc(pm.unit)+'</text>':'');
  P.forEach(function(p,i){out+='<text class="hm-lab" x="'+(cx+R+16)+'" y="'+(cy-P.length*8+i*16+4)+'">'+esc(p.name+' '+Math.round(p.value/tot*100)+'%')+'</text>';});
  return _cxSvg(pm,W,H,out,_cxLegend(P.map(function(p){return p.name;})));};

/* gauge: value, min, max, target \u2014 a bounded scale */
CHART_RENDERERS.gauge=function(pm){if(!_cxNum(pm.value)||!_cxNum(pm.min)||!_cxNum(pm.max)||pm.max<=pm.min)return _cxRefuse('gauge','it needs a value on a scale with a stated minimum and maximum');
  var W=_CX.W,H=130,cx=W/2,cy=H-20,R=86,f=function(v){return Math.max(0,Math.min(1,(v-pm.min)/(pm.max-pm.min)));},arc=function(t0,t1,cls){var a0=Math.PI*(1+t0),a1=Math.PI*(1+t1);
    return '<path class="'+cls+'" d="M'+(cx+R*Math.cos(a0)).toFixed(1)+' '+(cy+R*Math.sin(a0)).toFixed(1)+'A'+R+' '+R+' 0 0 1 '+(cx+R*Math.cos(a1)).toFixed(1)+' '+(cy+R*Math.sin(a1)).toFixed(1)+'"/>';};
  var out=arc(0,1,'cx-track')+arc(0,f(pm.value),'cx-fill');
  if(_cxNum(pm.target)){var at=Math.PI*(1+f(pm.target));out+='<line class="sb-target" x1="'+(cx+(R-12)*Math.cos(at)).toFixed(1)+'" y1="'+(cy+(R-12)*Math.sin(at)).toFixed(1)+'" x2="'+(cx+(R+10)*Math.cos(at)).toFixed(1)+'" y2="'+(cy+(R+10)*Math.sin(at)).toFixed(1)+'">'+_cxT('target '+fmtNum(pm.target,1))+'</line>';}
  out+='<text class="cx-big" x="'+cx+'" y="'+(cy-6)+'" text-anchor="middle">'+esc(fmtNum(pm.value,pm.digits||0)+(pm.unit?' '+pm.unit:''))+'</text><text class="hm-lab" x="'+(cx-R)+'" y="'+(H-4)+'" text-anchor="middle">'+esc(fmtNum(pm.min,0))+'</text><text class="hm-lab" x="'+(cx+R)+'" y="'+(H-4)+'" text-anchor="middle">'+esc(fmtNum(pm.max,0))+'</text>';
  return _cxSvg(pm,W,H,out);};

/* bullet: value, target, bands[{to,label}] */
CHART_RENDERERS.bullet=function(pm){var B=(pm.bands||[]).filter(function(b){return _cxNum(b.to);}).sort(function(a,b){return a.to-b.to;});
  if(!_cxNum(pm.value)||!B.length)return _cxRefuse('bullet','it needs a value and at least one band');
  var W=_CX.W,H=62,mx=Math.max(B[B.length-1].to,pm.value,pm.target||0),X=_cxScale(0,mx,4,W-6),out='',prev=0;
  B.forEach(function(b,i){out+='<rect class="cx-band'+(i%3)+'" x="'+X(prev).toFixed(1)+'" y="10" width="'+(X(b.to)-X(prev)).toFixed(1)+'" height="26">'+_cxT((b.label||'band')+': up to '+fmtNum(b.to,0))+'</rect>';prev=b.to;});
  out+='<rect class="cx-fill-bar" x="4" y="18" width="'+(X(pm.value)-4).toFixed(1)+'" height="10">'+_cxT('value '+fmtNum(pm.value,0))+'</rect>';
  if(_cxNum(pm.target))out+='<line class="cx-tick" x1="'+X(pm.target).toFixed(1)+'" x2="'+X(pm.target).toFixed(1)+'" y1="6" y2="40">'+_cxT('target '+fmtNum(pm.target,0))+'</line>';
  out+='<text class="hm-lab" x="4" y="54">0</text><text class="hm-lab" x="'+(W-6)+'" y="54" text-anchor="end">'+esc(fmtNum(mx,0))+'</text>';
  return _cxSvg(pm,W,H,out);};

/* waterfall: start{label,value}, steps[{label,value}] \u2014 each contribution from where the last ended */
CHART_RENDERERS.waterfall=function(pm){var st=pm.start,S=(pm.steps||[]).filter(function(s){return _cxNum(s.value);});
  if(!st||!_cxNum(st.value)||!S.length)return _cxRefuse('waterfall','it needs a starting total and at least one contribution');
  var run=st.value,lv=[run];S.forEach(function(s){run+=s.value;lv.push(run);});
  /* From zero, weekly changes of a pound or two vanish against a 255 lb total; fromZero:false starts near the data and says so. */
  var z=pm.fromZero!==false,span0=Math.max.apply(null,lv)-Math.min.apply(null,lv),lo=z?Math.min.apply(null,lv.concat([0])):Math.min.apply(null,lv)-Math.max(span0*0.15,0.5),hi=Math.max.apply(null,lv),W=_CX.W,H=_CX.H,n=S.length+2,bw=(W-_CX.pad)/n-6,Y=_cxScale(lo,hi,H-20,10),out='',cur=st.value;
  var every=Math.ceil(n/5),bar=function(i,a,b,cls,lab,t){var x=_CX.pad+i*((W-_CX.pad)/n)+3;return '<rect class="'+cls+'" x="'+x.toFixed(1)+'" y="'+Math.min(Y(a),Y(b)).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(1,Math.abs(Y(a)-Y(b))).toFixed(1)+'">'+_cxT(t)+'</rect>'+((i%every===0||i===n-1)?'<text class="hm-lab" x="'+(x+bw/2)+'" y="'+(H-4)+'" text-anchor="middle">'+esc(lab)+'</text>':'');};
  var base=z?0:lo;out+=bar(0,base,st.value,'sb-s0',st.label||'start',(st.label||'start')+': '+fmtNum(st.value,1));
  S.forEach(function(s,i){out+=bar(i+1,cur,cur+s.value,s.value>=0?'cx-up':'cx-down',s.label,s.label+': '+(s.value>=0?'+':'')+fmtNum(s.value,0));cur+=s.value;});
  out+=bar(n-1,base,cur,'sb-s0',pm.endLabel||'end',(pm.endLabel||'end')+': '+fmtNum(cur,1));
  return _cxSvg(pm,W,H,out,(z?'':'<div class="hint">The axis starts at '+esc(_cxFmt(lo))+(pm.unit?' '+esc(pm.unit):'')+', not zero, so the changes can be seen.</div>')+'<div class="hx-key"><span><i class="k-up"></i>adds</span><span><i class="k-down"></i>takes away</span></div>');};

/* sankey: nodes[{id,label,col}], links[{from,to,value}] \u2014 flows must be conserved through every middle node */
CHART_RENDERERS.sankey=function(pm){var N=pm.nodes||[],L=(pm.links||[]).filter(function(l){return _cxNum(l.value)&&l.value>0;});
  if(N.length<2||!L.length)return _cxRefuse('sankey','it needs at least two stages and a flow between them');
  var inn={},outn={};L.forEach(function(l){outn[l.from]=(outn[l.from]||0)+l.value;inn[l.to]=(inn[l.to]||0)+l.value;});
  var leak=N.filter(function(n){return inn[n.id]&&outn[n.id]&&Math.abs(inn[n.id]-outn[n.id])>Math.max(1,inn[n.id]*0.01);});
  if(leak.length)return _cxRefuse('sankey','flow is not conserved at '+leak.map(function(n){return n.label+' ('+fmtNum(inn[n.id],0)+' in, '+fmtNum(outn[n.id],0)+' out)';}).join(', '));
  var cols={};N.forEach(function(n){(cols[n.col||0]=cols[n.col||0]||[]).push(n);});var ck=Object.keys(cols).sort(function(a,b){return a-b;}),W=_CX.W,H=180,nw=10,tot=Math.max.apply(null,N.map(function(n){return Math.max(inn[n.id]||0,outn[n.id]||0);})),k=(H-30)/Math.max(tot,1)*0.8,pos={},out='';
  ck.forEach(function(c,ci){var x=8+ci*((W-40)/Math.max(1,ck.length-1)),y=10;cols[c].forEach(function(n){var h=Math.max(inn[n.id]||0,outn[n.id]||0)*k;pos[n.id]={x:x,y:y,h:h,oy:y,iy:y};
      out+='<rect class="sb-s0" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+nw+'" height="'+Math.max(1,h).toFixed(1)+'">'+_cxT(n.label+': '+fmtNum(Math.max(inn[n.id]||0,outn[n.id]||0),0))+'</rect><text class="hm-lab" x="'+(ci===ck.length-1?x-2:x+nw+3)+'" y="'+(y+10)+'"'+(ci===ck.length-1?' text-anchor="end"':'')+'>'+esc(n.label)+'</text>';y+=h+10;});});
  L.forEach(function(l){var a=pos[l.from],b=pos[l.to];if(!a||!b)return;var h=l.value*k,x0=a.x+nw,x1=b.x,y0=a.oy+h/2,y1=b.iy+h/2;a.oy+=h;b.iy+=h;
    out+='<path class="cx-flow" style="stroke-width:'+Math.max(1,h).toFixed(1)+'" d="M'+x0+' '+y0.toFixed(1)+'C'+((x0+x1)/2)+' '+y0.toFixed(1)+' '+((x0+x1)/2)+' '+y1.toFixed(1)+' '+x1+' '+y1.toFixed(1)+'">'+_cxT(l.from+' \u2192 '+l.to+': '+fmtNum(l.value,0))+'</path>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Band width is proportional to the amount flowing; what enters each stage leaves it.</div>');};

/* network: nodes[{id,label}], edges[{a,b,weight,label}] \u2014 circular layout, weight as line width */
CHART_RENDERERS.network=function(pm){var N=pm.nodes||[],E=(pm.edges||[]).filter(function(e){return e.a!==e.b;});
  if(N.length<2||!E.length)return _cxRefuse('network','it needs at least two entities and one relationship between them');
  var W=_CX.W,H=220,cx=W/2,cy=H/2,R=Math.min(70,20+N.length*7),P={},out='';N.forEach(function(n,i){var a=-Math.PI/2+2*Math.PI*i/N.length;P[n.id]=[cx+R*Math.cos(a),cy+R*Math.sin(a)];});
  var wm=Math.max.apply(null,E.map(function(e){return Math.abs(e.weight||1);}))||1;
  E.forEach(function(e){var a=P[e.a],b=P[e.b];if(!a||!b)return;out+='<line class="cx-edge'+((e.weight||1)<0?' neg':'')+'" style="stroke-width:'+(0.6+2.4*Math.abs(e.weight||1)/wm).toFixed(1)+'" x1="'+a[0].toFixed(1)+'" y1="'+a[1].toFixed(1)+'" x2="'+b[0].toFixed(1)+'" y2="'+b[1].toFixed(1)+'">'+_cxT(e.a+' \u2014 '+e.b+(e.label?': '+e.label:''))+'</line>';});
  /* Labels sit outside the circle, anchored away from the centre: centred on each node they collided. */
  N.forEach(function(n){var p=P[n.id],dx=p[0]-cx,dy=p[1]-cy,d=Math.sqrt(dx*dx+dy*dy)||1,lx=cx+dx/d*(R+9),ly=cy+dy/d*(R+9)+3,anc=Math.abs(dx)<8?'middle':(dx>0?'start':'end');
    out+='<circle class="tl-dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="5">'+_cxT(n.label)+'</circle><text class="hm-lab cx-halo" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="'+anc+'">'+esc(String(n.label).length>12?String(n.label).slice(0,11)+'\u2026':n.label)+'</text>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Line width is the strength of each relationship'+(E.some(function(e){return (e.weight||1)<0;})?'; dashed lines run the opposite way':'')+'.</div>');};

/* gantt: tasks[{label,start,end}] \u2014 durations and overlap */
CHART_RENDERERS.gantt=function(pm){var T=(pm.tasks||[]).filter(function(t){return isValidISO(t.start)&&isValidISO(t.end||t.start);});
  if(!T.length)return _cxRefuse('gantt','it needs at least one task with a start and an end');
  var bad=T.filter(function(t){return (t.end||t.start)<t.start;});if(bad.length)return _cxRefuse('gantt',bad[0].label+' ends before it starts');
  var d0=T.map(function(t){return t.start;}).sort()[0],d1=T.map(function(t){return t.end||t.start;}).sort().slice(-1)[0],W=_CX.W,rh=22,H=T.length*rh+20,X=_cxScale(0,Math.max(1,daysBetween(d0,d1)),80,W-6),out='';
  T.forEach(function(t,i){var y=i*rh+4,x0=X(daysBetween(d0,t.start)),x1=X(daysBetween(d0,t.end||t.start));out+='<text class="hm-lab" x="0" y="'+(y+12)+'">'+esc(t.label.length>13?t.label.slice(0,12)+'\u2026':t.label)+'</text><rect class="sb-s'+(i%2)+'" x="'+x0.toFixed(1)+'" y="'+y+'" width="'+Math.max(2,x1-x0).toFixed(1)+'" height="'+(rh-8)+'" rx="2">'+_cxT(t.label+': '+shortDate(t.start)+' \u2013 '+shortDate(t.end||t.start))+'</rect>';});
  out+='<text class="hm-lab" x="80" y="'+(H-2)+'">'+esc(shortDate(d0))+'</text><text class="hm-lab" x="'+(W-6)+'" y="'+(H-2)+'" text-anchor="end">'+esc(shortDate(d1))+'</text>';
  return _cxSvg(pm,W,H,out);};

/* candlestick: periods[{label,open,high,low,close}] \u2014 low <= open, close <= high */
CHART_RENDERERS.candlestick=function(pm){var P=(pm.periods||[]).filter(function(p){return ['open','high','low','close'].every(function(k){return _cxNum(p[k]);});});
  if(P.length<(CHART_TYPES.candlestick.minObservations||2))return _cxRefuse('candlestick','it needs at least two periods with an open, high, low and close');
  var bad=P.filter(function(p){return p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close);});if(bad.length)return _cxRefuse('candlestick','in '+bad[0].label+' the high or low does not contain the open and close');
  var lo=Math.min.apply(null,P.map(function(p){return p.low;})),hi=Math.max.apply(null,P.map(function(p){return p.high;})),W=_CX.W,H=_CX.H,Y=_cxScale(lo,hi,H-20,10),bw=(W-_CX.pad)/P.length,out='';
  P.forEach(function(p,i){var cx=_CX.pad+i*bw+bw/2,up=p.close>=p.open;out+='<line class="cx-wick" x1="'+cx+'" x2="'+cx+'" y1="'+Y(p.high).toFixed(1)+'" y2="'+Y(p.low).toFixed(1)+'"/><rect class="'+(up?'cx-up':'cx-down')+'" x="'+(cx-bw*0.3).toFixed(1)+'" y="'+Y(Math.max(p.open,p.close)).toFixed(1)+'" width="'+(bw*0.6).toFixed(1)+'" height="'+Math.max(1,Math.abs(Y(p.open)-Y(p.close))).toFixed(1)+'">'+_cxT(p.label+': opened '+fmtNum(p.open,1)+', high '+fmtNum(p.high,1)+', low '+fmtNum(p.low,1)+', closed '+fmtNum(p.close,1))+'</rect>'+(i%Math.ceil(P.length/6)===0?'<text class="hm-lab" x="'+cx+'" y="'+(H-4)+'" text-anchor="middle">'+esc(p.label)+'</text>':'');});
  out+='<text class="hm-lab" x="0" y="'+(Y(hi)+3).toFixed(1)+'">'+esc(_cxFmt(hi))+'</text><text class="hm-lab" x="0" y="'+(Y(lo)+3).toFixed(1)+'">'+esc(_cxFmt(lo))+'</text>';
  return _cxSvg(pm,W,H,out,'<div class="hx-key"><span><i class="k-up"></i>closed higher</span><span><i class="k-down"></i>closed lower</span></div>');};

/* smallMultiple: panels[{title,points[{x,y}]}] \u2014 the SAME axes in every panel */
CHART_RENDERERS.smallMultiple=function(pm){var P=(pm.panels||[]).filter(function(p){return (p.points||[]).length>=2;});if(P.length<2)return _cxRefuse('smallMultiple','it needs at least two panels with at least two points each');
  var all=[];P.forEach(function(p){all=all.concat(p.points);});var xlo=Math.min.apply(null,all.map(function(q){return q.x;})),xhi=Math.max.apply(null,all.map(function(q){return q.x;})),ylo=Math.min.apply(null,all.map(function(q){return q.y;})),yhi=Math.max.apply(null,all.map(function(q){return q.y;}));
  var cols=Math.min(3,P.length),rows=Math.ceil(P.length/cols),W=_CX.W,pw=W/cols,ph=74,H=rows*ph,out='';
  P.forEach(function(p,i){var ox=(i%cols)*pw,oy=Math.floor(i/cols)*ph,X=_cxScale(xlo,xhi,ox+4,ox+pw-6),Y=_cxScale(ylo,yhi,oy+ph-8,oy+16);
    out+='<text class="hm-lab" x="'+(ox+4)+'" y="'+(oy+10)+'">'+esc(p.title)+'</text><rect class="cx-panel" x="'+(ox+2)+'" y="'+(oy+13)+'" width="'+(pw-6)+'" height="'+(ph-18)+'"/><polyline class="cx-line" points="'+p.points.map(function(q){return X(q.x).toFixed(1)+','+Y(q.y).toFixed(1);}).join(' ')+'">'+_cxT(p.title+': '+p.points.length+' points')+'</polyline>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Every panel shares the same axes ('+esc(_cxFmt(ylo))+' to '+esc(_cxFmt(yhi))+(pm.unit?' '+esc(pm.unit):'')+'), so heights compare across panels.</div>');};

/* stackedArea: x[], series[{name,values[]}] \u2014 parts of one total over time */
CHART_RENDERERS.stackedArea=function(pm){var X0=pm.x||[],S=pm.series||[];if(X0.length<2||!S.length)return _cxRefuse('stackedArea','it needs at least two points in time and one part');
  if(S.some(function(s){return s.values.some(function(v){return _cxNum(v)&&v<0;});}))return _cxRefuse('stackedArea','a part cannot be negative in a stacked total');
  var tot=X0.map(function(x,i){return S.reduce(function(a,s){return a+(s.values[i]||0);},0);}),W=_CX.W,H=_CX.H,X=_cxScale(0,X0.length-1,_CX.pad,W-6),Y=_cxScale(0,Math.max.apply(null,tot)||1,H-20,10),base=X0.map(function(){return 0;}),out='';
  S.forEach(function(s,si){var top=base.map(function(b,i){return b+(s.values[i]||0);});
    out+='<path class="sb-s'+(si%4)+'" d="M'+X0.map(function(x,i){return X(i).toFixed(1)+' '+Y(top[i]).toFixed(1);}).join('L')+'L'+X0.map(function(x,i){return i;}).reverse().map(function(i){return X(i).toFixed(1)+' '+Y(base[i]).toFixed(1);}).join('L')+'Z">'+_cxT(s.name)+'</path>';base=top;});
  out+='<text class="hm-lab" x="'+_CX.pad+'" y="'+(H-4)+'">'+esc(X0[0])+'</text><text class="hm-lab" x="'+(W-6)+'" y="'+(H-4)+'" text-anchor="end">'+esc(X0[X0.length-1])+'</text>';
  return _cxSvg(pm,W,H,out,_cxLegend(S.map(function(s){return s.name;}))+'<div class="hint">Only the bottom band and the total can be read against the axis; the others sit on the bands below them.</div>');};

/* funnel: stages[{label,value}] \u2014 each stage a subset of the one before */
CHART_RENDERERS.funnel=function(pm){var S=(pm.stages||[]).filter(function(s){return _cxNum(s.value)&&s.value>=0;});if(S.length<2)return _cxRefuse('funnel','it needs at least two stages');
  var grow=S.filter(function(s,i){return i>0&&s.value>S[i-1].value;});if(grow.length)return _cxRefuse('funnel','"'+grow[0].label+'" is larger than the stage before it, so the stages are not a narrowing sequence');
  var W=_CX.W,rh=26,H=S.length*rh+6,mx=S[0].value||1,out='';
  S.forEach(function(s,i){var w=(W-150)*s.value/mx,x=(W-150-w)/2+110,y=i*rh+3;out+='<rect class="sb-s0" x="'+x.toFixed(1)+'" y="'+y+'" width="'+Math.max(1,w).toFixed(1)+'" height="'+(rh-5)+'" rx="2">'+_cxT(s.label+': '+fmtNum(s.value,0)+(i?(' ('+Math.round(s.value/S[i-1].value*100)+'% of the stage before)'):''))+'</rect><text class="hm-lab" x="0" y="'+(y+14)+'">'+esc(s.label.slice(0,16))+'</text><text class="hm-lab" x="'+(W-2)+'" y="'+(y+14)+'" text-anchor="end">'+esc(fmtNum(s.value,0))+'</text>';});
  return _cxSvg(pm,W,H,out);};

/* parallelCoordinates: axes[names], rows[{label,values[]}] \u2014 each axis normalised, and said so */
CHART_RENDERERS.parallelCoordinates=function(pm){var A=pm.axes||[],R=(pm.rows||[]).filter(function(r){return (r.values||[]).length===A.length;});
  if(A.length<3||R.length<2)return _cxRefuse('parallelCoordinates','it needs at least three variables and two observations with a value for each');
  var W=_CX.W,H=_CX.H,lo=A.map(function(a,j){return Math.min.apply(null,R.map(function(r){return r.values[j];}));}),hi=A.map(function(a,j){return Math.max.apply(null,R.map(function(r){return r.values[j];}));}),xs=A.map(function(a,j){return 10+j*((W-20)/(A.length-1));}),out='';
  A.forEach(function(a,j){out+='<line class="cx-grid" x1="'+xs[j]+'" x2="'+xs[j]+'" y1="12" y2="'+(H-22)+'"/><text class="hm-lab" x="'+xs[j]+'" y="'+(H-8)+'" text-anchor="'+(j===0?'start':(j===A.length-1?'end':'middle'))+'">'+esc(a)+'</text>';});
  R.forEach(function(r){out+='<polyline class="cx-pline" points="'+r.values.map(function(v,j){return xs[j].toFixed(1)+','+_cxScale(lo[j],hi[j],H-22,12)(v).toFixed(1);}).join(' ')+'">'+_cxT((r.label?r.label+': ':'')+A.map(function(a,j){return a+' '+fmtNum(r.values[j],1);}).join(', '))+'</polyline>';});
  return _cxSvg(pm,W,H,out,'<div class="hint">Each axis runs from its own lowest to highest value; the order of the axes changes which patterns are visible.</div>');};

/* tree: root{label,children[]} \u2014 a real parent for every node */
function _cxWalk(n,d,out,path){out.push({node:n,depth:d});(n.children||[]).forEach(function(c){_cxWalk(c,d+1,out);});return out;}
CHART_RENDERERS.tree=function(pm){var root=pm.root;if(!root||!root.label)return _cxRefuse('tree','it needs a root with a label');
  var F=_cxWalk(root,0,[]),W=_CX.W,rh=18,H=F.length*rh+6,out='',ys={};
  F.forEach(function(f,i){var y=i*rh+12,x=8+f.depth*18;ys[i]=y;out+='<circle class="tl-dot" cx="'+x+'" cy="'+(y-4)+'" r="3"/><text class="hm-lab" x="'+(x+7)+'" y="'+y+'">'+esc(f.node.label+(f.node.value!=null?' \u00b7 '+fmtNum(f.node.value,0):''))+'</text>';
    if(f.depth>0){for(var j=i-1;j>=0;j--)if(F[j].depth===f.depth-1){out+='<path class="cx-grid" d="M'+(8+(f.depth-1)*18)+' '+(ys[j]-1)+'V'+(y-4)+'H'+(x-3)+'"/>';break;}}});
  return _cxSvg(pm,W,H,out);};

/* treemap: items[{label,value}] (one level) \u2014 sizes that add up to the whole */
CHART_RENDERERS.treemap=function(pm){var I=(pm.items||[]).filter(function(i){return _cxNum(i.value)&&i.value>0;}).sort(function(a,b){return b.value-a.value;});
  if(I.length<2)return _cxRefuse('treemap','it needs at least two parts with a positive size');
  var tot=I.reduce(function(a,i){return a+i.value;},0);if(pm.total!=null&&Math.abs(tot-pm.total)>Math.max(1,pm.total*0.01))return _cxRefuse('treemap','the parts do not add up to the stated whole');
  var W=_CX.W,H=180,out='';
  (function lay(items,x,y,w,h){if(!items.length)return;if(items.length===1){var it=items[0];out+='<rect class="sb-s'+(it._i%4)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+Math.max(0,w-1).toFixed(1)+'" height="'+Math.max(0,h-1).toFixed(1)+'">'+_cxT(it.label+': '+fmtNum(it.value,0)+' ('+Math.round(it.value/tot*100)+'%)')+'</rect>'+
      (w>40&&h>14?'<text class="hm-lab cx-halo" x="'+(x+3)+'" y="'+(y+11)+'">'+esc(it.label.slice(0,Math.floor(w/6)))+'</text>':'');return;}
    var s=items.reduce(function(a,i){return a+i.value;},0),acc=0,k=0;while(k<items.length-1&&acc+items[k].value<s/2){acc+=items[k].value;k++;}if(k===0){acc=items[0].value;k=1;}
    var A=items.slice(0,k),B=items.slice(k),f=acc/s;if(w>=h){lay(A,x,y,w*f,h);lay(B,x+w*f,y,w*(1-f),h);}else{lay(A,x,y,w,h*f);lay(B,x,y+h*f,w,h*(1-f));}
  })(I.map(function(i,ix){return Object.assign({_i:ix},i);}),0,0,W,H);
  return _cxSvg(pm,W,H,out,'<div class="hint">Area is proportional to each part; small differences in area are hard to judge, so the exact shares are in each title.</div>');};

/* sunburst: root{label,children[{label,value,children}]} \u2014 sizes that add up the hierarchy */
function _cxSum(n){if(!(n.children||[]).length)return _cxNum(n.value)&&n.value>0?n.value:0;return n.children.reduce(function(a,c){return a+_cxSum(c);},0);}
CHART_RENDERERS.sunburst=function(pm){var root=pm.root;if(!root||!(root.children||[]).length)return _cxRefuse('sunburst','it needs a hierarchy with at least one level of parts');
  var mism=[];(function chk(n){if((n.children||[]).length&&_cxNum(n.value)&&Math.abs(n.value-_cxSum(n))>Math.max(1,n.value*0.01))mism.push(n.label);(n.children||[]).forEach(chk);})(root);
  if(mism.length)return _cxRefuse('sunburst','the parts of '+mism[0]+' do not add up to it');
  var tot=_cxSum(root);if(!tot)return _cxRefuse('sunburst','the parts add up to nothing');
  var W=_CX.W,H=210,cx=W/2,cy=H/2,rw=30,out='';
  (function ring(n,a0,a1,d){if(d>0){var r0=16+(d-1)*rw,r1=r0+rw-2,lg=(a1-a0)>Math.PI?1:0,p=function(a,r){return (cx+r*Math.cos(a)).toFixed(1)+' '+(cy+r*Math.sin(a)).toFixed(1);};
      out+='<path class="sb-s'+((d-1)%4)+' cx-seg" d="M'+p(a0,r1)+'A'+r1+' '+r1+' 0 '+lg+' 1 '+p(a1,r1)+'L'+p(a1,r0)+'A'+r0+' '+r0+' 0 '+lg+' 0 '+p(a0,r0)+'Z">'+_cxT(n.label+': '+fmtNum(_cxSum(n),0)+' ('+Math.round(_cxSum(n)/tot*100)+'% of all)')+'</path>';}
    var a=a0;(n.children||[]).forEach(function(c){var s=_cxSum(c),b=a+(a1-a0)*s/(_cxSum(n)||1);ring(c,a,b,d+1);a=b;});})(root,-Math.PI/2,1.5*Math.PI,0);
  return _cxSvg(pm,W,H,out,'<div class="hint">'+esc(pm.ringNote||'Each ring is one level of '+root.label.toLowerCase()+', inner to outer.')+' Outer rings look larger than their share because of their radius; each part\u2019s exact share is in its title.</div>');};

/* ---- THE CHART CATALOGUE, drawn from the person's own record ----
   Every type is shown with data it genuinely suits; where the record cannot support one, its own refusal is shown \u2014
   which is also the check that the refusals work. */
function _cxWeekKey(d){var dw=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;return addDays(d,-dw);}
function chartGallery(){
  var T=todayISO(),out=[],add=function(type,title,from,pm){var html;try{html=renderChartSpec(type,Object.assign({title:title},pm||{}));}catch(e){_q(e,'P2');html=_cxRefuse(type,'it failed to draw: '+(e&&e.message));}
    out.push({type:type,title:title,from:from,html:html,refused:/chart-refused/.test(html)});};
  var S=(DB.sessions||[]).filter(function(s){return !s.retracted&&!s.supersededBy;});
  var W=obsOf('weight').filter(function(o){return !o.retracted;}).sort(function(a,b){return a.date<b.date?-1:1;});
  var day=function(t,d){var r=dailySeries(t,T,120).filter(function(x){return x.date===d;})[0];return r?r.value:null;};
  var days=function(n){var a=[];for(var i=n-1;i>=0;i--)a.push(addDays(T,-i));return a;};
  /* sets per muscle group, this week and last */
  var setsBy=function(from,to){var m={};S.filter(function(s){return s.date>=from&&s.date<=to;}).forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);var g=e?_groupOf(e.pattern):'other';m[g]=(m[g]||0)+1;});});return m;};
  var thisW=setsBy(addDays(T,-6),T),lastW=setsBy(addDays(T,-13),addDays(T,-7)),groups=Object.keys(Object.assign({},thisW,lastW));
  add('groupedBar','Sets per movement group: this week and last','your sessions',{categories:groups,series:[{name:'Last week',values:groups.map(function(g){return lastW[g]||0;})},{name:'This week',values:groups.map(function(g){return thisW[g]||0;})}]});
  var R=exerciseResponse().rows.filter(function(r){return r.status==='ok';});
  add('bubble','Lifts: weekly sets, trend and exposures','the per-lift response model',{xLabel:'sets a week',yLabel:'e1RM trend a week',sizeLabel:'sessions',points:R.map(function(r){return {x:r.weeklySets,y:r.slopePerWeek,size:r.exposures,label:r.exercise};})});
  var st=days(90).map(function(d){return day('steps',d);}).filter(function(v){return v!=null;});
  add('density','How many steps a day, usually','your step counts',{values:st});
  var trainDays={};S.forEach(function(s){trainDays[s.date]=1;});var kcT=[],kcR=[];days(120).forEach(function(d){var v=day('calories',d);if(v==null)return;(trainDays[d]?kcT:kcR).push(v);});
  add('violin','Calories on training and rest days','your intake and sessions',{groups:[{name:'Training days',values:kcT},{name:'Rest days',values:kcR}]});
  var byM={};days(120).forEach(function(d){var v=day('steps',d);if(v==null)return;var m=d.slice(0,7);(byM[m]=byM[m]||[]).push(v);});
  /* Only months with at least 20 days: a partial month is not comparable with a full one. */
  add('ridgeline','Steps a day, month by month','your step counts',{groups:Object.keys(byM).sort().filter(function(m){return byM[m].length>=20;}).map(function(m){return {name:m,values:byM[m]};})});
  var pl=currentPlan(),tg=pl?pl.content.targets:{};var yd=addDays(T,-1);
  add('radar','Yesterday against each target','your plan and yesterday\u2019s logs',{axes:[['Calories','calories',tg.kcal],['Protein','protein',tg.protein],['Fibre','fiber',tg.fiber],['Steps','steps',tg.steps],['Sleep','sleep',tg.sleepH]].filter(function(a){return a[2];}).map(function(a){return {name:a[0],value:day(a[1],yd)||0,max:a[2]*1.25};})});
  var byDow=[0,0,0,0,0,0,0];S.forEach(function(s){byDow[(new Date(s.date+'T12:00:00Z').getUTCDay()+6)%7]++;});
  add('polar','Sessions by weekday','your sessions',{bins:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(l,i){return {label:l,value:byDow[i]};})});
  var P=(day('protein',yd)||0)*4,Cc=(day('carbs',yd)||0)*4,F=(day('fat',yd)||0)*9;
  add('donut','Yesterday\u2019s calories by macro','your food log',{unit:'kcal',parts:[{name:'Protein',value:P},{name:'Carbohydrate',value:Cc},{name:'Fat',value:F}].filter(function(x){return x.value>0;})});
  var G=canonicalGoal(),start=W.length?W[0].value:null,now=W.length?W[W.length-1].value:null;
  if(G.activeTargetLb&&start!=null){var span=start-G.activeTargetLb;add('gauge','Progress to the target weight','your weigh-ins and goal',{value:Math.max(0,Math.min(100,span?(start-now)/span*100:0)),min:0,max:100,unit:'%',digits:0});}
  else add('gauge','Progress to the target weight','your weigh-ins and goal',{});
  add('bullet','Protein yesterday against the target','your food log and plan',{value:day('protein',yd)||0,target:tg.protein||null,bands:tg.protein?[{to:tg.protein*0.8,label:'short'},{to:tg.protein,label:'close'},{to:tg.protein*1.3,label:'met'}]:[]});
  var wk={};W.forEach(function(o){var k=_cxWeekKey(o.date);(wk[k]=wk[k]||[]).push(o);});var WK=Object.keys(wk).sort().slice(-8);
  if(WK.length>=2){var first=wk[WK[0]][0].value,steps=[],prev=first;WK.slice(1).forEach(function(k){var last=wk[k][wk[k].length-1].value;steps.push({label:shortDate(k),value:round(last-prev,1)});prev=last;});
    add('waterfall','How the weight change built up, week by week','your weigh-ins',{start:{label:shortDate(WK[0]),value:first},steps:steps,endLabel:'now',fromZero:false,unit:'lb'});}
  add('sankey','Yesterday\u2019s calories, from food to macros','your food log',{nodes:[{id:'Food',label:'Food',col:0},{id:'Protein',label:'Protein',col:1},{id:'Carbohydrate',label:'Carbohydrate',col:1},{id:'Fat',label:'Fat',col:1}],
    links:[{from:'Food',to:'Protein',value:P},{from:'Food',to:'Carbohydrate',value:Cc},{from:'Food',to:'Fat',value:F}]});
  /* The graph identifies nodes by key, and edges run key to key; starting from edges gives connected nodes. */
  try{var KG=knowledgeGraph(),E=(KG.edges||[]).slice(0,14),keys={};E.forEach(function(e){keys[e.from]=1;keys[e.to]=1;});
    var ND=(KG.nodes||[]).filter(function(n){return keys[n.key];}).slice(0,12),has={};ND.forEach(function(n){has[n.key]=1;});
    add('network','What the app relates to what','the knowledge graph',{nodes:ND.map(function(n){return {id:n.key,label:String(n.label||n.kind).slice(0,14)};}),
      edges:E.filter(function(e){return has[e.from]&&has[e.to];}).map(function(e){return {a:e.from,b:e.to,weight:1,label:e.rel};})});}
  catch(e){_q(e,'P2');add('network','What the app relates to what','the knowledge graph',{});}
  add('gantt','Phases','your phases',{tasks:(DB.phases||[]).filter(function(p){return p.startDate;}).map(function(p){return {label:((PHASE_TYPES[p.type]||{}).label||p.type),start:p.startDate,end:p.endDate&&p.endDate<T?p.endDate:T};})});
  add('candlestick','Weight each week: first, highest, lowest and last weigh-in','your weigh-ins',{periods:WK.map(function(k){var o=wk[k],v=o.map(function(x){return x.value;});return {label:shortDate(k),open:o[0].value,close:o[o.length-1].value,high:Math.max.apply(null,v),low:Math.min.apply(null,v)};})});
  /* As % change from each lift's first session: a shared axis across a 500 lb leg press and a 55 lb incline press
     flattened every line. */
  add('smallMultiple','Estimated max per lift, as % change from the first session','your sessions',{panels:R.slice(0,6).map(function(r){var pts=[];S.forEach(function(s){var b=0;(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise),re=resolveExercise(r.exercise);if(e&&re&&e.id===re.id){var E1=e1rm(x.load,x.reps),v=E1&&E1.value;if(v>b)b=v;}});   /* matched by identity, not by name */if(b)pts.push({x:daysBetween(S[0].date,s.date),y:b});});var b0=pts.length?pts[0].y:0;return {title:r.exercise,points:pts.map(function(q){return {x:q.x,y:b0?round((q.y/b0-1)*100,1):0};})};}),unit:'%'});
  var wks=[];for(var i=7;i>=0;i--)wks.push(_cxWeekKey(addDays(T,-i*7)));var wsum=function(t,k){var s=0,n=0;for(var d=0;d<7;d++){var v=day(t,addDays(k,d));if(v!=null){s+=v;n++;}}return n?s/n:0;};
  add('stackedArea','Average daily calories by macro, week by week','your food log',{x:wks.map(shortDate),series:[{name:'Protein',values:wks.map(function(k){return wsum('protein',k)*4;})},{name:'Carbohydrate',values:wks.map(function(k){return wsum('carbs',k)*4;})},{name:'Fat',values:wks.map(function(k){return wsum('fat',k)*9;})}]});
  var A=adherenceAnalysis(4).training;
  if(A)add('funnel','Scheduled sessions, from plan to full volume','the last four weeks',{stages:[{label:'Scheduled',value:A.counts.scheduled},{label:'Done at all',value:A.counts.done+A.counts.partial},{label:'Done in full',value:A.counts.done}]});
  add('parallelCoordinates','Each day: calories, protein, steps and sleep','your logs',{axes:['Calories','Protein','Steps','Sleep'],rows:days(30).map(function(d){var v=[day('calories',d),day('protein',d),day('steps',d),day('sleep',d)];return v.every(function(x){return x!=null;})?{label:shortDate(d),values:v}:null;}).filter(Boolean)});
  var tr={label:'Training',children:[]},gm={};S.filter(function(s){return s.date>=addDays(T,-27);}).forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e)return;var g=_groupOf(e.pattern);gm[g]=gm[g]||{};gm[g][e.name]=(gm[g][e.name]||0)+1;});});
  Object.keys(gm).forEach(function(g){tr.children.push({label:g,value:Object.keys(gm[g]).reduce(function(a,k){return a+gm[g][k];},0),children:Object.keys(gm[g]).map(function(k){return {label:k,value:gm[g][k]};})});});
  add('tree','Sets by movement group and exercise, last four weeks','your sessions',{root:tr});
  add('treemap','Sets by movement group, last four weeks','your sessions',{items:tr.children.map(function(c){return {label:c.label,value:c.value};})});
  add('sunburst','Sets by movement group and exercise, as rings','your sessions',{root:tr,ringNote:'Inner ring: movement groups; outer ring: exercises.'});
  return out;
}
SHEETS.chartGallery=function(){var G=chartGallery(),C=chartCatalogueSummary();
  return {body:'<div class="hint">'+C.available+' of '+C.total+' chart types can be drawn. Each below uses your own record; where the record cannot support one, the chart says why instead of drawing it.</div>'+
    G.map(function(g){return '<div class="card-title" style="margin-top:12px">'+esc(g.title)+'</div><div class="prov">'+esc(g.type)+' \u00b7 from '+esc(g.from)+'</div>'+g.html;}).join(''),foot:uiBtn('Close','edit.close',null,'btn-secondary')};};
