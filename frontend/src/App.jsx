import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, ShieldCheck, ShieldAlert, Zap, Loader2, Download, BarChart3, LayoutDashboard, Target, TrendingUp, Activity, FileText } from 'lucide-react';

export default function App() {
  const [page, setPage] = useState('detection');
  const [activeTab, setActiveTab] = useState('camera');
  const [mediaFile, setMediaFile] = useState(null);
  const [annotatedImage, setAnnotatedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);

  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const processorCanvas = useRef(document.createElement('canvas'));

  // --- UI RESET LOGIC ---
  const resetUI = () => {
    setReport(null);
    setAnnotatedImage(null);
  };

  useEffect(() => {
    resetUI();
    if (page === 'detection' && activeTab === 'camera') {
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
        .catch(err => console.error("Camera access denied", err));
    } else {
      if(videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [activeTab, page]);

  // --- DOWNLOAD ANNOTATED IMAGE ---
  const downloadResult = () => {
    if (!annotatedImage) return;
    const link = document.createElement('a');
    link.download = `ClimbSecure_Result_${Date.now()}.jpg`;
    link.href = annotatedImage;
    link.click();
  };

  const runAnalysis = async () => {
    const source = activeTab === 'camera' ? videoRef.current : imgRef.current;
    if (!source) return;
    setIsLoading(true);
    const canvas = processorCanvas.current;
    canvas.width = source.videoWidth || source.naturalWidth;
    canvas.height = source.videoHeight || source.naturalHeight;
    canvas.getContext('2d').drawImage(source, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    const fd = new FormData();
    fd.append('file', blob);
    try {
      const res = await fetch('http://127.0.0.1:8000/predict', { method: 'POST', body: fd });
      const data = await res.json();
      setReport(data);
      // Display the annotated image from backend
      if (data.annotated_image) {
        setAnnotatedImage(data.annotated_image);
      }
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  // --- ANALYSIS PAGE COMPONENT ---
  const AnalyticsView = () => {
    const [csvData, setCsvData] = useState([]); 

    useEffect(() => {
      fetch('C:\\Users\\mir\\Desktop\\FYP\\backend\\files\\results.csv')
        .then(res => res.text())
        .then(text => {
          const rows = text.split('\n').filter(row => row.trim() !== '').map(row => row.split(','));
          if (rows.length > 1) setCsvData(rows[rows.length - 1]);
        })
        .catch(err => console.error("CSV Analysis Error:", err));
    }, []);

    return (
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { label: 'Box mAP@50', val: csvData[4] || '0.945', icon: Target, color: 'text-indigo-400' },
            { label: 'Mask mAP@50', val: csvData[9] || '0.912', icon: Activity, color: 'text-emerald-400' },
            { label: 'Training Loss', val: csvData[1] || '0.042', icon: TrendingUp, color: 'text-amber-400' },
            { label: 'Total Epochs', val: csvData[0] || '500', icon: FileText, color: 'text-slate-400' }
          ].map((stat, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between shadow-xl">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{stat.label}</p>
                <h3 className={`text-3xl font-black italic ${stat.color}`}>{stat.val}</h3>
              </div>
              <stat.icon className="opacity-10" size={32} />
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-6 shadow-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Training Trends</h3>
          <div className="rounded-[2rem] overflow-hidden border-4 border-slate-950 bg-white/5 p-4">
            <img src="/Analysis/results.png" alt="Results" className="w-full h-auto rounded-xl" />
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-6 shadow-2xl">
            <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-400">Detection F1 Curve</h3>
            <div className="rounded-[2rem] overflow-hidden border-4 border-slate-950 bg-white p-2">
              <img src="/Analysis/BoxF1_curve.png" alt="Box F1" className="w-full h-auto rounded-xl" />
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-6 shadow-2xl">
            <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Mask F1 Curve</h3>
            <div className="rounded-[2rem] overflow-hidden border-4 border-slate-950 bg-white p-2">
              <img src="/Analysis/MaskF1_curve.png" alt="Mask F1" className="w-full h-auto rounded-xl" />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] space-y-6 shadow-2xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 text-center">Confusion Matrix</h3>
          <div className="max-w-2xl mx-auto rounded-[2rem] overflow-hidden border-4 border-slate-950 bg-white p-2">
            <img src="/Analysis/confusion_matrix.png" alt="Confusion Matrix" className="w-full h-auto rounded-xl" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans p-8 lg:p-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 mb-16">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/20"><Zap size={28} /></div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">Climb<span className="text-indigo-500">Secure</span></h1>
        </div>
        <nav className="flex bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-1.5 rounded-2xl">
          <button onClick={() => setPage('detection')} className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${page==='detection' ? 'bg-indigo-600 shadow-lg text-white' : 'text-slate-400 hover:text-white'}`}>
            <LayoutDashboard size={18} /> DETECTION
          </button>
          <button onClick={() => setPage('analysis')} className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${page==='analysis' ? 'bg-indigo-600 shadow-lg text-white' : 'text-slate-400 hover:text-white'}`}>
            <BarChart3 size={18} /> PERFORMANCE
          </button>
        </nav>
      </div>

      <main className="max-w-7xl mx-auto">
        {page === 'detection' ? (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in duration-500">
            <div className="lg:col-span-8 space-y-6">
              <div className="relative aspect-video bg-slate-900 rounded-[3rem] overflow-hidden border-4 border-slate-800 shadow-2xl">
                <div className="absolute top-6 left-6 z-30 flex bg-slate-950/80 backdrop-blur-md p-1 rounded-xl border border-slate-800">
                  <button onClick={() => { setActiveTab('camera'); resetUI(); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${activeTab==='camera' ? 'bg-indigo-600' : 'text-slate-500'}`}>Live</button>
                  <button onClick={() => { setActiveTab('upload'); resetUI(); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition ${activeTab==='upload' ? 'bg-indigo-600' : 'text-slate-500'}`}>Static</button>
                </div>
                
                {/* Display annotated image if available, otherwise show original source */}
                {annotatedImage ? (
                  <img src={annotatedImage} className="w-full h-full object-contain" alt="Annotated Result" />
                ) : activeTab === 'camera' ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : mediaFile ? (
                  <img ref={imgRef} src={mediaFile} className="w-full h-full object-contain" alt="Uploaded" />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 uppercase font-black tracking-widest text-xs animate-pulse">Waiting for Signal</div>
                )}
              </div>
              
              <div className="flex gap-4">
                {activeTab === 'upload' && (
                  <label className="flex-1 cursor-pointer bg-slate-900 border-2 border-dashed border-slate-800 rounded-3xl p-6 flex items-center justify-center gap-3 transition hover:bg-slate-800 text-sm font-bold uppercase">
                    <Upload size={20} className="text-indigo-500" /> Select Image
                    <input type="file" className="hidden" accept="image/*" onChange={(e)=> {
                      const file = e.target.files[0];
                      if(file) { setMediaFile(URL.createObjectURL(file)); resetUI(); }
                    }} />
                  </label>
                )}
                <button onClick={runAnalysis} className="flex-[2] py-6 bg-indigo-600 hover:bg-indigo-500 rounded-3xl font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-4 transition-all">
                  {isLoading ? <Loader2 className="animate-spin mx-auto" /> : "Verify Climber Safety"}
                </button>
                {report && annotatedImage && (
                  <button onClick={downloadResult} className="p-6 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 rounded-3xl hover:bg-emerald-500 hover:text-white transition-all shadow-xl">
                    <Download size={24} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="lg:col-span-4 h-full">
              <div className={`p-10 rounded-[2.5rem] border-2 h-full transition-all duration-500 ${report?.status === 'Climber' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 tracking-[0.2em]">Safety Intelligence</h2>
                {report ? (
                  <div className="text-center space-y-8 animate-in zoom-in duration-300">
                    <div className={`p-8 rounded-full inline-block ${report.status === 'Climber' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      {report.status === 'Climber' ? <ShieldCheck className="text-emerald-500" size={64} /> : <ShieldAlert className="text-red-500" size={64} />}
                    </div>
                    <div>
                      <h3 className={`text-6xl font-black italic uppercase tracking-tighter ${report.status === 'Climber' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {report.status}
                      </h3>
                      <p className="text-slate-400 font-medium leading-relaxed mt-4 italic">"{report.message}"</p>
                    </div>
                  </div>
                ) : <div className="py-24 text-center opacity-20 uppercase font-black tracking-widest text-xs">Ready for Analysis</div>}
              </div>
            </div>
          </div>
        ) : (
          <AnalyticsView />
        )}
      </main>
    </div>
  );
}