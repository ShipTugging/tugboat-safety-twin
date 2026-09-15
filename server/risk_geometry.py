"""Geometry of the visible selected mask, with explicit limits on partial views."""
from collections import deque
import math
import cv2
import numpy as np
from skimage.morphology import skeletonize


def measure_geometry(mask, confidence):
    result={'valid':False,'status':'missing','flags':[],'sag_ratio':None,'angle_deg':None,
            'mask_pixels':0,'equivalent_pixels_720p':0,'chord_px':None,'endpoints':None,'centerline':[]}
    if mask is None: return result
    array=np.asarray(mask)
    if array.ndim!=2 or not array.size or not np.isfinite(array).all():
        result.update(status='invalid',flags=['INVALID_MASK']);return result
    binary=(array>0).astype(np.uint8)
    area=int(binary.sum()); h,w=binary.shape
    result.update(mask_pixels=area,equivalent_pixels_720p=area*1280*720/(w*h))
    if not area: return result
    flags=result['flags']; result['status']='degraded'
    # Predicted area is a quality proxy; the report's subgroup used GT area.
    if result['equivalent_pixels_720p']<500: flags.append('SMALL_MASK')
    if confidence is None or not math.isfinite(confidence) or confidence<.7: flags.append('LOW_CONFIDENCE')
    if binary[0].any() or binary[-1].any() or binary[:,0].any() or binary[:,-1].any(): flags.append('CLIPPED_MASK')
    count,labels,stats,_=cv2.connectedComponentsWithStats(binary,8)
    selected=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
    if int(stats[selected,cv2.CC_STAT_AREA])/area<.8: flags.append('FRAGMENTED_MASK')
    yy,xx=np.nonzero(skeletonize(labels==selected))
    coords=list(zip(xx.tolist(),yy.tolist())); lookup={p:i for i,p in enumerate(coords)}
    if len(coords)<2: flags.append('NO_CENTERLINE');return result
    neighbors=[]
    for x,y in coords:
        neighbors.append([lookup[(x+dx,y+dy)] for dx,dy in [(-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)] if (x+dx,y+dy) in lookup])
    def farthest(start):
        prev={start:None};q=deque([start]);last=start
        while q:
            last=q.popleft()
            for n in neighbors[last]:
                if n not in prev: prev[n]=last;q.append(n)
        return last,prev
    a,_=farthest(0);b,prev=farthest(a);path=[];node=b
    while node is not None:path.append(coords[node]);node=prev[node]
    if len(path)/len(coords)<.75: flags.append('BRANCHED_CENTERLINE')
    points=np.asarray(path,dtype=float)
    # Endpoints have deterministic orientation, but the risk angle is modulo 180.
    if tuple(points[-1][::-1])<tuple(points[0][::-1]): points=points[::-1]
    chord=points[-1]-points[0];length=float(np.linalg.norm(chord));result['chord_px']=length
    if length<60*math.sqrt(w*h/(1280*720)):flags.append('SHORT_CHORD')
    if length<=0:return result
    rel=points-points[0];deviation=np.linalg.norm(rel-np.outer(rel@(chord/length),chord/length),axis=1)
    sag=float(np.max(deviation)/length)
    if sag>.5: flags.append('IMPLAUSIBLE_GEOMETRY')
    p1,p2=points[-1],points[0];angle=math.degrees(math.atan2(p2[0]-p1[0],p1[1]-p2[1]))
    result['endpoints']=[points[0].tolist(),points[-1].tolist()]
    result['centerline']=points[::max(1,len(points)//100)].tolist()
    if not flags: result.update(valid=True,status='valid',sag_ratio=sag,angle_deg=angle)
    return result
