import React from 'react';
import { Download, Camera, Square, Shuffle, Spline } from 'lucide-react';
import type { DatasetController } from '../hooks/useDatasetExporter';
import { classNamesFor } from '../dataset/types';
import { SAG_LEVEL_NAMES } from '../simulation/towline';
import { TOW_POSITION_LABELS } from '../simulation/towPosition';
import type { CapturePosition } from '../dataset/position';
import type { LensSelection } from '../dataset/lens';

const SAG_PREVIEW_COLORS=['#7ee0a8','#c9e07e','#f1d28e','#f0a25e','#f57b73','#7fc7ff'];

export function DatasetControls({dataset,onRandomize}:{dataset:DatasetController;onRandomize:()=>void}) {
  const d=dataset;
  const classes=classNamesFor(d.archiveKind);
  const sagPreview=d.preview?.sag;
  return <section className="dataset-controls" aria-label="AI 데이터 생성">
    <label className="dataset-toggle"><span><Camera size={15}/>AI 데이터 생성 모드</span><input type="checkbox" role="switch" checked={d.enabled} disabled={d.busy} onChange={e=>d.setEnabled(e.target.checked)}/></label>
    {d.enabled && <div className="dataset-body">
      <fieldset className="dataset-kind" disabled={d.busy} aria-label="데이터셋 종류">
        <button type="button" aria-pressed={d.kind==='sag'} onClick={()=>d.setKind('sag')}><Spline size={13}/>예인줄 Sag 분할</button>
        <button type="button" aria-pressed={d.kind==='detection'} onClick={()=>d.setKind('detection')}><Camera size={13}/>객체 탐지 박스</button>
      </fieldset>
      <div className="dataset-capture-options">
        <label>캡처 위치<select aria-label="데이터셋 캡처 위치" value={d.capturePosition} disabled={d.busy} onChange={e=>d.setCapturePosition(e.target.value as CapturePosition)}>
          <option value="current">현재 · {TOW_POSITION_LABELS[d.currentPosition]}</option><option value="astern">선미</option><option value="port">좌현</option><option value="starboard">우현</option><option value="ahead">선수</option><option value="all">네 방향 혼합</option>
        </select></label>
        <label>렌즈 상태<select aria-label="데이터셋 렌즈 상태" value={d.lensSelection} disabled={d.busy} onChange={e=>d.setLensSelection(e.target.value as LensSelection)}>
          <option value="mixed">자동 혼합</option><option value="clear">맑음</option><option value="blurred">흐림</option><option value="wet">물 튐</option>
        </select></label>
      </div>
      <p className="dataset-note">{d.kind==='sag'
        ?'선택 위치의 예인줄 감시 시점 · Sag 5단계 + 픽셀 마스크'
        :'선택 위치에서 자유/CCTV 시점 순환 · YOLO 박스 4클래스'}</p>
      <div className="dataset-settings">
        <label>이미지 수<input aria-label="데이터셋 이미지 수" type="number" min={1} max={500} step={1} value={Number.isFinite(d.count)?d.count:''} disabled={d.busy} onChange={e=>d.setCount(e.target.valueAsNumber)}/></label>
        <label>무작위 시드<input aria-label="무작위 시드" type="number" min={0} max={4294967295} step={1} value={Number.isFinite(d.seed)?d.seed:''} disabled={d.busy} onChange={e=>d.setSeed(e.target.valueAsNumber)}/></label>
      </div>
      <div className="dataset-actions">
        {d.busy ? <button onClick={d.cancel}><Square size={13}/>생성 취소</button> : <button className="dataset-primary" onClick={d.start}><Camera size={14}/>AI 데이터셋 캡처</button>}
        <button aria-label="환경 무작위화" title="환경 무작위화" onClick={onRandomize} disabled={d.busy}><Shuffle size={14}/></button>
      </div>
      {(d.busy||d.status) && <div className="dataset-progress"><progress max={100} value={d.progress}/><span role="status">{d.status}</span></div>}
      {d.error && <p role="alert" className="dataset-error">{d.error}</p>}
      {d.archiveBlob && <><button className="dataset-download" onClick={d.download}><Download size={14}/>ZIP 다운로드 · {(d.archiveBlob.size/1048576).toFixed(1)} MB</button>
        <p className="dataset-note">{d.archiveKind==='sag'
          ?`Sag ${d.classCounts.slice(0,5).map((n,i)=>`L${i} ${n}`).join(' · ')} · 선미 ${d.classCounts[5]??0}`
          :`예인선 ${d.classCounts[0]} · 팽팽한 줄 ${d.classCounts[1]} · 처진 줄 ${d.classCounts[2]} · 선미 ${d.classCounts[3]}`}</p></>}
      {d.preview && <details className="dataset-preview"><summary>마지막 프레임 · 라벨 확인</summary>
        <div className="dataset-image"><img src={d.preview.jpeg} alt="생성된 마지막 프레임"/>
          {d.archiveKind==='sag'
            ?<svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">{d.preview.labels.map((label,i)=>label.polygon&&<polygon key={i} points={label.polygon.map(([x,y])=>`${x},${y}`).join(' ')} fill={SAG_PREVIEW_COLORS[label.classId]??'#fff'} fillOpacity={label.classId===5?.08:.55} stroke={SAG_PREVIEW_COLORS[label.classId]??'#fff'} strokeWidth={.003} vectorEffect="non-scaling-stroke"/>)}</svg>
            :d.preview.labels.map((label,i)=><span key={i} style={{left:`${(label.box.xCenter-label.box.width/2)*100}%`,top:`${(label.box.yCenter-label.box.height/2)*100}%`,width:`${label.box.width*100}%`,height:`${label.box.height*100}%`}}><b>{label.classId}</b></span>)}
        </div>
        {d.preview.mask && <div className="dataset-image dataset-mask"><img src={d.preview.mask} alt="예인줄 마스크"/></div>}
        {sagPreview && <small>Sag L{sagPreview.truth.level} {SAG_LEVEL_NAMES[sagPreview.truth.level]} · 3D {sagPreview.truth.sagRatio.toFixed(4)} ({sagPreview.truth.sagM.toFixed(2)} m / {sagPreview.truth.spanM.toFixed(1)} m) · 영상 {sagPreview.image?sagPreview.image.ratio.toFixed(4):'-'} · 가시 {(sagPreview.visibleFraction*100).toFixed(0)}%</small>}
        <small>{d.previewMode} · {classes.join(' / ')}</small></details>}
      <p className="dataset-note">960 × 540 · JPEG{d.kind==='sag'?' + PNG 마스크 + YOLO-Seg + data.yaml + sag_labels.csv':' + YOLO'} · 최대 500장</p>
    </div>}
  </section>;
}
