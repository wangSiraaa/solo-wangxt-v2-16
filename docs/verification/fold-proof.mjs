// Leaf-pile ground truth (N=8 example):
//  right pile top->bottom: R-leaves k=0..ns-1  {RA=1+2k, RB=2+2k}
//  left  pile top->bottom: L-leaves k=ns-1..0  {LA=N-2k, LB=N-1-2k}
// Openings (left page | right page), each crossing = Ry(pi) for that leaf:
//   first ns openings (R leaves cross right->left):
//     L = RB sheet k=j-1 (flips 1, reader left)
//     R = RA sheet k=j   (flips 0, reader right)         [j<ns]
//     R = LB sheet k=ns-1 (flips 0, reader right)        [j=ns]
//   remaining ns-1 openings (L leaves cross left->right):
//     L = LA sheet k=ns-1-t (flips 1, reader left)
//     R = LB sheet k=ns-2-t (flips 0, reader right)
// Closed: RA k=0 = cover (right, flips 0); LA k=0 = back cover (behind closed book).
const PI=Math.PI;
const mul=(A,B)=>A.map((r,i)=>r.map((_,j)=>r.reduce((s,_,k)=>s+A[i][k]*B[k][j],0)));
const v=(M,x)=>[0,1,2].map(i=>M[i].reduce((s,m,k)=>s+m*x[k],0));
const Ry=t=>[[Math.cos(t),0,Math.sin(t)],[0,1,0],[-Math.sin(t),0,Math.cos(t)]];
const Rx=t=>[[1,0,0],[0,Math.cos(t),-Math.sin(t)],[0,Math.sin(t),Math.cos(t)]];
const Rz=t=>[[Math.cos(t),-Math.sin(t),0],[Math.sin(t),Math.cos(t),0],[0,0,1]];
const I=[[1,0,0],[0,1,0],[0,0,1]];
const near=(a,b,t=1e-9)=>a.every((x,i)=>Math.abs(x-b[i])<t);

function pileOrder(N){
  const ns=N/4, openings=[];
  for(let j=1;j<=ns;j++){
    const L={page:2*j, half:'R',side:'B', flips:1};                 // RB k=j-1
    let R;
    if(j<ns) R={page:1+2*j, half:'R',side:'A', flips:0};            // RA k=j
    else     R={page:N-1-2*(ns-1), half:'L',side:'B', flips:0};     // LB k=ns-1
    openings.push({L,R});
  }
  for(let t=0;t<ns-1;t++){
    const k=ns-1-t;
    const L={page:N-2*k, half:'L',side:'A', flips:1};               // LA
    const R={page:N-1-2*(k-1), half:'L',side:'B', flips:0};         // LB k-1
    openings.push({L,R});
  }
  return openings;
}

function checkOrder(N){
  return pileOrder(N).map(o=>[o.L.page,o.R.page]);
}

function evalPanel(p,theta,Vb){
  const V=p.side==='A'?I:Vb;
  const fold=p.half==='R'?Ry(PI):I;
  const T=Ry(PI*p.flips);
  const G=Ry(PI);
  const Mc=mul(G,mul(T,mul(fold,mul(V,Rz(theta)))));
  const Mn=mul(G,mul(T,mul(fold,V)));
  let pos=[p.half==='R'?0.5:-0.5,0,0];
  pos=v(mul(G,mul(T,mul(fold,I))),pos);
  return {up:v(Mc,[0,1,0]),n:v(Mn,[0,0,1]),x:pos[0]};
}

function keyOf(p,N,k){
  if(p.half==='L'&&p.side==='A') return ['LA',N-2*k];
  if(p.half==='R'&&p.side==='A') return ['RA',1+2*k];
  if(p.half==='L'&&p.side==='B') return ['LB',N-1-2*k];
  return ['RB',2+2*k];
}

function solve(Vb,N){
  const out=[];
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)for(let d=0;d<2;d++){
    const th={LA:a*PI,RA:b*PI,LB:c*PI,RB:d*PI};
    let ok=true, err=null;
    // closed cover & back
    const cover=evalPanel({half:'R',side:'A',flips:0},th.RA,Vb);
    const back0=evalPanel({half:'L',side:'A',flips:0},th.LA,Vb);
    const back={n:v(Ry(PI),back0.n),up:v(Ry(PI),back0.up)};
    if(!(near(cover.n,[0,0,1])&&near(cover.up,[0,1,0])&&cover.x>0.1)) ok=false;
    if(!(near(back.n,[0,0,1])&&near(back.up,[0,1,0]))) ok=false;
    for(const o of pileOrder(N)){
      for(const side of ['L','R']){
        const p=o[side];
        let key;
        const ns=N/4;
        if(p.half==='L'&&p.side==='A') key='LA';
        else if(p.half==='R'&&p.side==='A') key='RA';
        else if(p.half==='L'&&p.side==='B') key='LB';
        else key='RB';
        const e=evalPanel(p,th[key],Vb);
        const upright=near(e.n,[0,0,1])&&near(e.up,[0,1,0]);
        const correctSide = side==='L' ? e.x<-0.1 : e.x>0.1;
        if(!upright||!correctSide){ok=false;err=`p${p.page}(${side}) up=${upright} side=${correctSide}`;}
      }
    }
    if(ok) out.push([a,b,c,d]);
  }
  return out;
}

for(const N of [4,8,12,16]){
  console.log(`N=${N} openings:`,JSON.stringify(checkOrder(N)));
  for(const [name,Vb] of [['short Ry',Ry(PI)],['long Rx',Rx(PI)]]){
    const s=solve(Vb,N).map(r=>r.join(''));
    console.log(`  ${name}: theta180 [LA,RA,LB,RB] = ${s.join(' ')||'NONE'}`);
  }
}
