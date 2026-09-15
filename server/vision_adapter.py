"""Frozen-model runtime contract: class 0 max confidence, original xy, round, fill."""
import base64
import cv2
import numpy as np


def prediction_mask(result, shape, threshold=.25):
    if tuple(result.orig_shape)!=tuple(shape):raise ValueError('YOLO original shape mismatch')
    if result.boxes is None or result.masks is None:return None,None,{'instance_count':0,'selected_instance':None}
    scores=result.boxes.conf.cpu().numpy();classes=result.boxes.cls.cpu().numpy()
    if len(scores)!=len(result.masks.xy):raise ValueError('YOLO mask/box count mismatch')
    eligible=np.flatnonzero((classes==0)&np.isfinite(scores)&(scores>=threshold)&(scores<=1))
    meta={'instance_count':int(len(eligible)),'selected_instance':None,
          'instance_policy':'highest_confidence_class_0_first_tie',
          'mask_restore':'original_masks_xy_np_rint_fillPoly'}
    if not eligible.size:return None,None,meta
    index=int(eligible[np.argmax(scores[eligible])]);meta['selected_instance']=index
    polygon=np.asarray(result.masks.xy[index])
    if polygon.ndim!=2 or polygon.shape[1]!=2 or len(polygon)<3 or not np.isfinite(polygon).all():return None,None,meta
    mask=np.zeros(shape,np.uint8)
    cv2.fillPoly(mask,[np.rint(polygon).astype(np.int32)],255)
    if not mask.any():return None,None,meta
    return mask,float(scores[index]),meta


def vision_payload(mask, confidence, shape):
    encoded=None
    if mask is not None:
        ok,png=cv2.imencode('.png',mask)
        if not ok:raise ValueError('Cannot encode mask PNG')
        encoded=base64.b64encode(png).decode('ascii')
    return {'towline_detected':mask is not None,'confidence':confidence if mask is not None else None,
            'mask_base64':encoded,'mask_width':shape[1],'mask_height':shape[0]}
