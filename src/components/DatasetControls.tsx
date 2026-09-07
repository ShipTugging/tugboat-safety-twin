import React from 'react';
import { Download, Camera, Square, Shuffle } from 'lucide-react';
import type { DatasetController } from '../hooks/useDatasetExporter';

export function DatasetControls({dataset,onRandomize}:{dataset:DatasetController;onRandomize:()=>void}) {
  const d=dataset;
  return <section className="dataset-controls" aria-label="AI 데이터 생성">
    <label className="dataset-toggle"><span><Camera size={15}/>AI 데이터 생성 모드</span><input type="checkbox" role="switch" checked={d.enabled} disabled={d.busy} onChange={e=>d.setEnabled(e.target.checked)}/></label>
    {d.enabled && <div className="dataset-body">
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
      {d.archiveBlob && <><button className="dataset-download" onClick={d.download}><Download size={14}/>ZIP 다운로드 · {(d.archiveBlob.size/1048576).toFixed(1)} MB</button><p className="dataset-note">예인선 {d.classCounts[0]} · 팽팽한 줄 {d.classCounts[1]} · 처진 줄 {d.classCounts[2]} · 선미 {d.classCounts[3]}</p></>}
      {d.preview && <details className="dataset-preview"><summary>마지막 프레임 · 라벨 확인</summary><div className="dataset-image"><img src={d.preview.jpeg} alt="생성된 마지막 프레임"/>{d.preview.labels.map((label,i)=><span key={i} style={{left:`${(label.box.xCenter-label.box.width/2)*100}%`,top:`${(label.box.yCenter-label.box.height/2)*100}%`,width:`${label.box.width*100}%`,height:`${label.box.height*100}%`}}><b>{label.classId}</b></span>)}</div><small>{d.previewMode}</small></details>}
      <p className="dataset-note">960 × 540 · JPEG + YOLO · 최대 500장</p>
    </div>}
  </section>;
}
