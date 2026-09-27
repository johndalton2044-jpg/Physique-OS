/* Icon generation with no dependencies and no Python.
 *
 * The build previously shelled out to `python3` with Pillow. That works on a developer machine and fails on
 * any CI image that ships Node and nothing else — which is most of them, and is exactly how the Vercel build
 * broke. A build step that needs a second language runtime is a build step that will stop working somewhere.
 *
 * Node has zlib built in, and a PNG is a header, one zlib-compressed block of scanlines, and a CRC. So the
 * icons are rasterised and encoded here: a few hundred lines of arithmetic against an unbounded dependency
 * surface is the better trade.
 */
import zlib from 'node:zlib';

/* ---------- a tiny RGBA canvas with the three primitives the mark needs ---------- */
export function canvas(size){
  const px=new Uint8ClampedArray(size*size*4);
  const idx=(x,y)=>((y*size+x)<<2);
  /* Source-over blending, so strokes layer correctly and anti-aliased edges are not chalky. */
  const blend=(x,y,r,g,b,a)=>{
    if(a<=0||x<0||y<0||x>=size||y>=size)return;
    const i=idx(x|0,y|0), sa=a, da=px[i+3]/255, out=sa+da*(1-sa);
    if(out<=0){px[i+3]=0;return;}
    px[i]  =(r*sa+px[i]  *da*(1-sa))/out;
    px[i+1]=(g*sa+px[i+1]*da*(1-sa))/out;
    px[i+2]=(b*sa+px[i+2]*da*(1-sa))/out;
    px[i+3]=out*255;
  };
  /* Coverage is sampled on a 3x3 grid per pixel. Cheap, and enough to keep a 16px favicon legible \u2014 hard
     edges at that size are what make a small icon look like a mistake. */
  const SS=3, STEP=1/(SS+1);
  const coverage=(x,y,inside)=>{
    let hits=0;
    for(let i=1;i<=SS;i++)for(let j=1;j<=SS;j++)if(inside(x+i*STEP,y+j*STEP))hits++;
    return hits/(SS*SS);
  };
  const fill=(inside,[r,g,b],alpha=1)=>{
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const c=coverage(x,y,inside);
      if(c>0)blend(x,y,r,g,b,c*alpha);
    }
  };
  return {
    size,pixels:px,
    fillAll([r,g,b],a=1){for(let y=0;y<size;y++)for(let x=0;x<size;x++)blend(x,y,r,g,b,a);},
    roundedRect(x0,y0,x1,y1,radius,color,alpha=1){
      fill((x,y)=>{
        if(x<x0||y<y0||x>x1||y>y1)return false;
        const cx=Math.min(Math.max(x,x0+radius),x1-radius);
        const cy=Math.min(Math.max(y,y0+radius),y1-radius);
        const dx=x-cx, dy=y-cy;
        return dx*dx+dy*dy<=radius*radius||(x>=x0+radius&&x<=x1-radius)||(y>=y0+radius&&y<=y1-radius);
      },color,alpha);
    },
    ring(cx,cy,r,width,color,alpha=1){
      const inner=r-width/2, outer=r+width/2;
      fill((x,y)=>{const d=Math.hypot(x-cx,y-cy);return d>=inner&&d<=outer;},color,alpha);
    },
    disc(cx,cy,r,color,alpha=1){
      fill((x,y)=>Math.hypot(x-cx,y-cy)<=r,color,alpha);
    },
    /* A polyline with round joins and caps, drawn as the union of capsules. */
    polyline(points,width,color,alpha=1){
      const hw=width/2;
      const near=(x,y,ax,ay,bx,by)=>{
        const vx=bx-ax, vy=by-ay, len2=vx*vx+vy*vy;
        let t=len2?((x-ax)*vx+(y-ay)*vy)/len2:0;
        t=t<0?0:(t>1?1:t);
        return Math.hypot(x-(ax+vx*t),y-(ay+vy*t))<=hw;
      };
      fill((x,y)=>{
        for(let i=0;i<points.length-1;i++)
          if(near(x,y,points[i][0],points[i][1],points[i+1][0],points[i+1][1]))return true;
        return false;
      },color,alpha);
    },
    /* Keep the colour, drop the alpha where the mask says so \u2014 used for the rounded-corner cut-out. */
    maskTo(inside){
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const c=coverage(x,y,inside), i=((y*size+x)<<2);
        px[i+3]=px[i+3]*c;
      }
    }
  };
}

/* ---------- PNG encoding ---------- */
const CRC_TABLE=(()=>{
  const t=new Int32Array(256);
  for(let n=0;n<256;n++){let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c;}
  return t;
})();
function crc32(buf){
  let c=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function chunk(type,data){
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const body=Buffer.concat([Buffer.from(type,'ascii'),data]);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);
  return Buffer.concat([len,body,crc]);
}
export function encodePNG(cv){
  const {size,pixels}=cv;
  /* Filter byte 0 (none) per scanline. The icons are tiny, so a smarter filter buys nothing worth the code. */
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++){
    raw[y*(size*4+1)]=0;
    for(let x=0;x<size*4;x++)raw[y*(size*4+1)+1+x]=pixels[y*size*4+x];
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
  ihdr[8]=8;    // bit depth
  ihdr[9]=6;    // colour type: RGBA
  ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),
    chunk('IEND',Buffer.alloc(0))
  ]);
}

/* ---------- the mark ----------
   A ring with a rising line through it, ending in a dot: measurement, trend, the point you are at. Geometry
   is expressed against a 512 grid and scaled, so every size is the same drawing rather than a resized one. */
const INK={bg:[16,18,22],ring:[143,188,143],line:[228,231,228],dot:[155,141,179]};
export function drawIcon(size,{maskable=false}={}){
  const cv=canvas(size);
  const s=size/512;
  cv.fillAll(INK.bg,1);
  /* A maskable icon must keep its content inside the safe area, because the platform may crop it to any
     shape. A normal icon gets rounded corners instead. */
  const pad=maskable?0.12:0;
  const P=(x,y)=>[(x*(1-2*pad)+512*pad)*s,(y*(1-2*pad)+512*pad)*s];
  const scale=v=>v*(1-2*pad)*s;
  const [cx,cy]=P(256,256);
  cv.ring(cx,cy,scale(150),Math.max(2,18*s),INK.ring);
  cv.polyline([P(150,300),P(215,235),P(262,282),P(362,182)],Math.max(2,22*s),INK.line);
  const [ex,ey]=P(362,182);
  cv.disc(ex,ey,scale(20),INK.dot);
  if(!maskable){
    const r=96*s;
    cv.maskTo((x,y)=>{
      const x0=0,y0=0,x1=size-1,y1=size-1;
      if(x<x0||y<y0||x>x1||y>y1)return false;
      const qx=Math.min(Math.max(x,x0+r),x1-r), qy=Math.min(Math.max(y,y0+r),y1-r);
      const dx=x-qx, dy=y-qy;
      return dx*dx+dy*dy<=r*r||(x>=x0+r&&x<=x1-r)||(y>=y0+r&&y<=y1-r);
    });
  }
  return encodePNG(cv);
}
