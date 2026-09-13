import { seededRandom } from '../environment';
import type { ParentPlan, Split } from './scenarios';

export const requiredCoverage={
  tow_position:['astern','port','starboard','ahead'],sag_bin:['L0','L1','L2','L3','L4'],
  time_of_day:['day','sunset','night'],lens_condition:['clear','blurred','wet'],
  steering_direction:['positive','negative'],
} as const;
export const splits:Split[]=['train','val','test'];
const axes=Object.entries(requiredCoverage);
const keys=axes.flatMap(([axis,values])=>values.map(value=>`${axis}:${value}`));
const fullMask=(1<<keys.length)-1;
export function variantConditions(index:number,variant:number) {
  return {timeOfDay:requiredCoverage.time_of_day[(index+variant)%3],lens:requiredCoverage.lens_condition[(Math.floor(index/3)+variant)%3]};
}
function vector(p:Omit<ParentPlan,'split'>):number[] {
  const v=keys.map(()=>0);
  for(let variant=0;variant<2;variant++) {
    const c=variantConditions(p.index,variant);
    for(const key of [`tow_position:${p.towPosition}`,`sag_bin:L${p.sagBin}`,`time_of_day:${c.timeOfDay}`,`lens_condition:${c.lens}`,`steering_direction:${p.steeringSign>0?'positive':'negative'}`])v[keys.indexOf(key)]++;
  }
  return v;
}
const popcount=(n:number)=>{let c=0;while(n){n&=n-1;c++;}return c;};

/** Allocate whole parents. Exact coverage search precedes marginal balancing.
 * Seeded ties only change split membership; parent/sample RNG slots stay intact.
 */
export function stratifyParents(parents:Omit<ParentPlan,'split'>[],requested:Record<Split,number>,seed:number):ParentPlan[] {
  const n=parents.length,counts={...requested},vectors=parents.map(vector);
  if(splits.some(s=>!Number.isInteger(counts[s])||counts[s]<0)||splits.reduce((sum,s)=>sum+counts[s],0)!==n)throw new Error('Parent quotas must be nonnegative integers summing to parent count');
  if(new Set(parents.map(p=>p.index)).size!==n)throw new Error('Duplicate parent indices in split plan');
  const masks=vectors.map(v=>v.reduce((m,count,i)=>count?m|(1<<i):m,0));
  const availability=keys.map((_,i)=>masks.filter(m=>m&(1<<i)).length);
  const unavailable=keys.flatMap((key,i)=>availability[i]<splits.length?[`${key}: only ${availability[i]} eligible parents for ${splits.length} splits`]:[]);
  if(unavailable.length)throw new Error(`Split coverage unavailable: ${unavailable.join('; ')}`);
  // Five distinct Sag bins require at least five parents in each split.
  const minimum=requiredCoverage.sag_bin.length;
  if(n<minimum*splits.length)throw new Error(`Split coverage impossible: sag_bin L0..L4 requires at least ${minimum} parents per split (${minimum*splits.length} total); available ${n}`);
  for(const split of splits)while(counts[split]<minimum) {
    const donor=[...splits].sort((a,b)=>counts[b]-counts[a])[0];
    counts[donor]--;counts[split]++;
  }
  const random=seededRandom(seed^0x5a17),ties=parents.map(()=>random());
  const assigned=new Array<Split|undefined>(n),used={train:0,val:0,test:0};
  const sums:Record<Split,number[]>={train:keys.map(()=>0),val:keys.map(()=>0),test:keys.map(()=>0)};
  const global=keys.map((_,i)=>vectors.reduce((sum,v)=>sum+v[i],0));
  let target=Object.fromEntries(splits.map(s=>[s,global.map(v=>v*counts[s]/n)])) as Record<Split,number[]>;
  const covered=(s:Split)=>sums[s].reduce((m,count,i)=>count?m|(1<<i):m,0);
  const cost=(s:Split,i:number)=>vectors[i].reduce((sum,v,k)=>sum+(2*sums[s][k]*v+v*v-2*target[s][k]*v)/Math.max(target[s][k],1),0);
  const put=(i:number,s:Split,sign:number)=>{assigned[i]=sign>0?s:undefined;used[s]+=sign;vectors[i].forEach((v,k)=>sums[s][k]+=sign*v);};
  let nodes=0;
  function cover():boolean {
    let constraint:{split:Split;key:number;candidates:number[];slots:number}|undefined;
    const coverage=Object.fromEntries(splits.map(s=>[s,covered(s)])) as Record<Split,number>;
    let minimumRemaining=0;
    for(const split of splits) {
      let splitMinimum=0;
      const missing=fullMask&~coverage[split],slots=counts[split]-used[split];
      if(missing&&!slots)return false;
      let offset=0;
      for(const [,values] of axes) {
        const bits=((1<<values.length)-1)<<offset;
        const maxPerParent=values===requiredCoverage.time_of_day||values===requiredCoverage.lens_condition?2:1;
        const needed=Math.ceil(popcount(missing&bits)/maxPerParent);
        splitMinimum=Math.max(splitMinimum,needed);
        if(needed>slots)return false;
        offset+=values.length;
      }
      minimumRemaining+=splitMinimum;
      for(let key=0;key<keys.length;key++)if(missing&(1<<key)) {
        const candidates=parents.flatMap((_,i)=>assigned[i]===undefined&&(masks[i]&(1<<key))?[i]:[]);
        if(!candidates.length)return false;
        // A missing category must retain one distinct parent for every other missing split.
        const demand=splits.filter(s=>!(coverage[s]&(1<<key))).length;
        if(candidates.length<demand)return false;
        if(!constraint||candidates.length<constraint.candidates.length||(candidates.length===constraint.candidates.length&&slots<constraint.slots))constraint={split,key,candidates,slots};
      }
    }
    if(minimumRemaining>n-splits.reduce((sum,s)=>sum+used[s],0))return false;
    if(!constraint)return true;
    if(++nodes>500000)throw new Error(`Split coverage search budget exhausted at ${constraint.split}/${keys[constraint.key]}; feasibility undetermined for parent quotas ${JSON.stringify(counts)}. Increase available parents or revise ratios.`);
    const {split,candidates}=constraint,missing=fullMask&~covered(split);
    candidates.sort((a,b)=>popcount(masks[b]&missing)-popcount(masks[a]&missing)||cost(split,a)-cost(split,b)||ties[a]-ties[b]);
    for(const i of candidates){put(i,split,1);if(cover())return true;put(i,split,-1);}
    return false;
  }
  if(!cover()) {
    // Coverage outranks ratios: retry without fixed per-split upper quotas.
    for(const s of splits)counts[s]=n;
    nodes=0;
    if(!cover())throw new Error(`Joint split coverage impossible with ${n} available parents: cannot cover ${keys.join(', ')} in every split even after relaxing ratios`);
    for(const s of splits)counts[s]=Math.max(requested[s],used[s],minimum);
    while(splits.reduce((sum,s)=>sum+counts[s],0)>n) {
      const donor=splits.filter(s=>counts[s]>Math.max(used[s],minimum)).sort((a,b)=>(counts[b]-requested[b])-(counts[a]-requested[a]))[0];
      if(!donor)throw new Error('Coverage allocation exceeded available parents');
      counts[donor]--;
    }
    target=Object.fromEntries(splits.map(s=>[s,global.map(v=>v*counts[s]/n)])) as Record<Split,number[]>;
  }
  // Fill remaining capacity by the increase in weighted marginal squared error.
  const remaining=parents.flatMap((_,i)=>assigned[i]===undefined?[i]:[]);
  remaining.sort((a,b)=>vectors[a].reduce((sum,v,k)=>sum+v/availability[k],0)-vectors[b].reduce((sum,v,k)=>sum+v/availability[k],0)||ties[a]-ties[b]);
  for(const i of remaining) {
    const split=splits.filter(s=>used[s]<counts[s]).sort((a,b)=>cost(a,i)-cost(b,i)||splits.indexOf(a)-splits.indexOf(b))[0];
    put(i,split,1);
  }
  for(const split of splits)if(used[split]!==counts[split]||covered(split)!==fullMask)throw new Error(`Split postcondition failed: ${split}`);
  return parents.map((p,i)=>({...p,split:assigned[i]!}));
}
