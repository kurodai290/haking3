const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({limit:'2kb'}));
app.use(session({secret:process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave:false, saveUninitialized:false, cookie:{httpOnly:true, sameSite:'lax', secure:'auto', maxAge: 1000*60*60*8}}));

// 正解はサーバー側にだけ保存。クライアントへは返しません。
const ANSWERS = {
  "1": "231ced6d606c13bd2546d9343615d70e430ee48f5ab437523a6d6fb1904511b6",
  "2": "bf8e5dbb603f0f5447640b79fa5d5e27dd239d8a63ed9c6b369d887009a9467d",
  "3": "7cc6f41f65ae829c10fb2701eab017d43650bcdefdcdd0363d9d347a321ffa5a",
  "4": "33c604aed594a9618f582adf5c78809254b81770ae3638d628e3c3b5012c357a",
  "5": "46989b6fb57cb658fbf9a234b4ecc512675be870c947d5a89e76506a16a2b9d7",
  "6": "3a5e8ee3ff8e82c6a1f187e2df1eac027208d8f7b92dcaeeb95573ab5855fb00",
  "7": "21db98ac119ed289000cf0b434074132747077c255d22cb83d7065ba61054b55",
  "8": "d4a084f26e57caa6094c0f3658e9e185625ef680ad21ad9e244fff928978a5f9",
  "9": "537dc501540e8eb1fda29f845f086a47da4cea5be32c96404f086c01fd177b2d",
  "10": "bbe6b9b1a150c18a8d390d7521ecf91b8042651322b70c2b9f232be583cf1a8a",
  "11": "185c102b2470a0f77e9e1a5a74bf6b3c3c12407b36e4a678211d978adbfd7aca",
  "12": "4417f6ff4735a19f0f5cd07442dd4a357d5e0d17e61303dddb009fd5a2cb0f9c",
  "13": "95a802d9fc26298ed631ee0742fede778082774dc9dcc25917c04d0f7c605216",
  "14": "e8ec4668681b26f4a474f32ae2462e508a84d45ff55d65d81aa89c3d59da9861",
  "15": "a275ed14d4eddac54280cd3bfb9bd751a0ab888f8c16fccdc000eda7475fd47e"
};
const DETOUR_ANSWERS = {
  "4": "396cdb8246d748977b2a2ba7258d0a916c7b9910ade620519684d35d33e87b5f",
  "8": "35fcdee9b9238f7ed41a17b8d4dfafdeb0577917191150eb43567d5163a20c72",
  "12": "9b21b03d9048a5e6799a5c7052283250a92ca32a7089203a0c37d113d9ee9c53"
};
const CHECKPOINTS = [4,8,12];
const normalize = value => String(value ?? '').trim().replace(/\s+/g,'').toUpperCase();
const digest = value => crypto.createHash('sha256').update(normalize(value)).digest('hex');
const equalHash = (a,b) => { try { return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')); } catch { return false; } };
function state(req) { if (!req.session.progress) req.session.progress = {stage:1, detour:null, tries:0}; return req.session.progress; }
function jsonError(res,status,message) { return res.status(status).json({ok:false,message}); }

app.get('/api/progress',(req,res)=>{ const p=state(req); res.set('Cache-Control','no-store'); res.json({ok:true,stage:p.stage,detour:p.detour,complete:p.stage>15}); });
app.post('/api/verify',(req,res)=>{
  const p=state(req); const stage=Number(req.body?.stage); const answer=normalize(req.body?.answer);
  res.set('Cache-Control','no-store');
  if (!Number.isInteger(stage) || stage!==p.stage || stage<1 || stage>15 || p.detour) return jsonError(res,409,'進行状態が一致しません。現在のステージを開き直してください。');
  if (answer.length<1 || answer.length>100) return jsonError(res,400,'回答を入力してください。');
  p.tries++;
  const expected=ANSWERS[String(stage)];
  if (!equalHash(digest(answer),expected)) return res.json({ok:false,message:'不正解です。記録をもう一度調査してください。'});
  if (CHECKPOINTS.includes(stage)) { p.detour=stage; return res.json({ok:true,detour:true,nextPath:'/detour'+String(stage).padStart(2,'0')+'.html',message:'一次認証成功。別ページで調査を続けてください。'}); }
  p.stage=stage+1;
  const next=p.stage>15?'/complete.html':'/stage'+String(p.stage).padStart(2,'0')+'.html';
  return res.json({ok:true,detour:false,nextPath:next,message:'認証成功'});
});
app.post('/api/verify-detour',(req,res)=>{
  const p=state(req); const checkpoint=Number(req.body?.checkpoint); const answer=normalize(req.body?.answer);
  res.set('Cache-Control','no-store');
  if (!p.detour || checkpoint!==p.detour || !CHECKPOINTS.includes(checkpoint)) return jsonError(res,409,'この調査ページはまだ解除されていません。');
  if (answer.length<1 || answer.length>100) return jsonError(res,400,'回答を入力してください。');
  p.tries++;
  if (!equalHash(digest(answer),DETOUR_ANSWERS[String(checkpoint)])) return res.json({ok:false,message:'照合失敗。関連ページをもう一度確認してください。'});
  p.stage=checkpoint+1; p.detour=null;
  const next='/stage'+String(p.stage).padStart(2,'0')+'.html';
  return res.json({ok:true,nextPath:next,message:'URL照合成功。次のステージを解除しました。'});
});
app.post('/api/reset',(req,res)=>{ req.session.progress={stage:1,detour:null,tries:0}; res.set('Cache-Control','no-store'); res.json({ok:true}); });

// ステージURLの直接入力や detour の直アクセスをサーバー側で制限。
app.use((req,res,next)=>{
  const p=state(req); const stageMatch=req.path.match(/^\/stage(\d{2})\.html$/);
  const detourMatch=req.path.match(/^\/detour(\d{2})\.html$/);
  if (stageMatch) { const n=Number(stageMatch[1]); if (n!==p.stage || p.detour || n>15) return res.redirect('/index.html'); }
  if (detourMatch) { const n=Number(detourMatch[1]); if (p.detour!==n || !CHECKPOINTS.includes(n)) return res.redirect('/index.html'); }
  if (req.path==='/complete.html' && p.stage<=15) return res.redirect('/index.html');
  next();
});
app.use(express.static(path.join(__dirname),{extensions:['html'], etag:false, maxAge:0}));
app.get('/health',(req,res)=>res.json({ok:true,service:'BLACKBOX',stage:state(req).stage}));
app.get('*',(req,res)=>res.status(404).sendFile(path.join(__dirname,'404.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`BLACKBOX listening on ${PORT}`));
