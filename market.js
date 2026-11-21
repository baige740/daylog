import {icon} from './icons.js';
const assets=[
  ['上证指数','点','chart','#438a71','#e4f2e9'],
  ['COMEX 黄金','美元 / 金衡盎司','gold','#bc9145','#faf0d8'],
  ['COMEX 白银','美元 / 金衡盎司','gem','#7c8fa6','#edf0f5'],
  ['WTI 原油','美元 / 桶','oil','#a78062','#f5ede4']
];
const symbols=['sh000001','hf_GC','hf_SI','hf_CL'];
const endpoint='https://qt.gtimg.cn/q='+symbols.join(',');
const format=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const delta=n=>(n>0?'+':'')+n.toFixed(2)+'%';
const gramsPerTroyOunce=31.1034768;
const rateKey='daylog:usd-cny';
// ExchangeRate-API USD snapshot also covers a first visit without FX connectivity.
const bundledRate={rate:6.69198,asOf:1795132952,nextUpdate:1795221582};
function validRate(fx){
  return Number.isFinite(fx?.rate)&&fx.rate>0&&Number.isSafeInteger(fx.asOf)&&fx.asOf>0&&fx.asOf<=Date.now()/1000+300&&Number.isSafeInteger(fx.nextUpdate)&&fx.nextUpdate>fx.asOf
}
function yuanPrice(symbol,price,rate){
  if(symbol==='hf_CL')return format(price*rate)+' 元/桶';
  return format(price*rate/gramsPerTroyOunce)+' 元/克'
}
function rateDate(fx){
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(fx.asOf*1000)
}
function updateHistory(history,quote){
  const rows=(history||[]).slice(),date=quote.timestamp.slice(0,10),last=rows.at(-1);
  if(last?.[0]===date&&last.length===3){rows[rows.length-1]=[date,quote.price,'quote']}
  else if(!last||date>last[0]){rows.push([date,quote.price,'quote'])}
  return rows.slice(-32)
}
function curve(rows,color,id,large=false){
  if(!rows?.length)return '';
  const values=rows.map(r=>r[1]),low=Math.min(...values),span=Math.max(...values)-low||1;
  const coords=values.map((p,i)=>(2+i*106/Math.max(1,values.length-1)).toFixed(2)+','+(32-(p-low)/span*26).toFixed(2)).join(' ');
  return '<svg class="'+(large?'chart-detail':'spark')+'" viewBox="0 0 110 37" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".17"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs><polygon points="2,37 '+coords+' 108,37" fill="url(#'+id+')"/><polyline points="'+coords+'" fill="none" stroke="'+color+'" stroke-width="'+(large?2:1.65)+'" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>'
}
function quotes(raw){
  return symbols.map((s,i)=>{
    const str=raw.match(new RegExp('v_'+s+'="([^"]+)"'))?.[1];
    if(!str)return null;
    const f=str.split(i?',':'~'),t=f[30]||'';
    const price=Number(i?f[0]:f[3]),change=Number(i?f[1]:f[32]);
    const timestamp=i?f[12]+' '+f[6]:t.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/,'$1-$2-$3 $4:$5:$6');
    return price>0&&Number.isFinite(change)&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(timestamp)?{price,change,timestamp}:null
  })
}
export async function startMarket(openDialog,toast){
  const section=document.querySelector('#markets'),state=document.querySelector('#market-state'),btn=document.querySelector('#refresh');
  let rows=[],refreshing=false;
  let fx=bundledRate,retryRateAfter=0;
  try{const saved=JSON.parse(localStorage.getItem(rateKey));if(validRate(saved)&&saved.asOf>=fx.asOf)fx=saved}catch{}
  async function refreshRate(){
    const now=Date.now();
    if(now<Math.max(fx.nextUpdate*1000,retryRateAfter))return;
    retryRateAfter=now+3600000;
    try{
      const response=await fetch('https://open.er-api.com/v6/latest/USD',{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(9000)});
      if(!response.ok)return;
      const data=await response.json();
      const next={rate:data.rates?.CNY,asOf:data.time_last_update_unix,nextUpdate:data.time_next_update_unix};
      if(data.result!=='success'||data.base_code!=='USD'||!validRate(next)||next.asOf<fx.asOf)return;
      fx=next;paint();
      try{localStorage.setItem(rateKey,JSON.stringify(fx))}catch{}
    }catch{/* Keep the dated local rate while the provider is unavailable. */}
  }
  function paint(){
    section.innerHTML=assets.map(([name,unit,glyph,tone,light],i)=>{
      const r=rows[i];
      const cny=i&&r?'<span class="market-cny" title="汇率时间 '+rateDate(fx)+' 北京时间">≈ '+yuanPrice(symbols[i],r.price,fx.rate)+'</span>':'';
      return '<button class="market-card" data-asset="'+i+'" style="--tone:'+tone+';--light:'+light+'"><span class="market-name"><span class="asset-glyph">'+icon(glyph)+'</span>'+name+'</span><strong class="market-price">'+(r?format(r.price):'—')+' <small>'+unit+'</small></strong>'+cny+'<span class="market-change '+(r?.change>0?'up':'')+'">'+(r?icon(r.change>0?'trendUp':'trendDown')+delta(r.change):'暂无报价')+'</span>'+curve(r?.history,tone,'curve'+i)+'</button>'
    }).join('');
  }
  function showStatus(cached){
    const latest=rows.map(r=>r?.timestamp||'').sort().at(-1);
    state.innerHTML=latest?'<i></i>'+(cached?'行情快照':'最近报价')+' · '+latest.slice(5,16):'行情暂不可用';
  }
  section.addEventListener('click',e=>{
    const b=e.target.closest('[data-asset]');if(!b)return;const i=Number(b.dataset.asset),r=rows[i],[name,unit,,color]=assets[i];
    if(!r){toast('行情暂不可用，可点击刷新重试');return}
    const h=r.history||[];
    const conversion=i?'<dt>人民币折算</dt><dd>约 '+yuanPrice(symbols[i],r.price,fx.rate)+'</dd><dt>参考汇率</dt><dd>1 美元 = '+fx.rate+' 元人民币</dd><dt>汇率时间</dt><dd>'+rateDate(fx)+' 北京时间</dd><dt>汇率来源</dt><dd><a href="https://www.exchangerate-api.com/" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a></dd>':'';
    openDialog(name,'<div class="detail-price">'+format(r.price)+' <small style="font-size:14px;color:#718375">'+unit+'</small></div>'+curve(h,color,'detail-chart',true)+'<dl class="dialog-info">'+conversion+'<dt>'+(i?'美元涨跌幅':'涨跌幅')+'</dt><dd>'+delta(r.change)+'</dd><dt>报价时间</dt><dd>'+r.timestamp+' 北京时间</dd><dt>报价来源</dt><dd>腾讯财经</dd>'+(h.length?'<dt>走势范围</dt><dd>'+h[0][0]+' 至 '+h.at(-1)[0]+'</dd><dt>走势来源</dt><dd>'+(i?'新浪财经':'腾讯财经')+'历史收盘价，随后按日保留本机获取的最近报价。</dd>':'')+'</dl>')
  });
  async function refresh(manual=false){
    if(refreshing)return;refreshing=true;btn.disabled=true;
    void refreshRate();
    try{
      const response=await fetch(endpoint,{cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw Error();const data=quotes(new TextDecoder('gb18030').decode(await response.arrayBuffer()));
      if(data.some(r=>!r))throw Error();
      rows=data.map((q,i)=>({...rows[i],symbol:symbols[i],...q,history:updateHistory(rows[i]?.history,q)}));
      try{localStorage.setItem('daylog:market',JSON.stringify(rows))}catch{}
      paint();showStatus(false);if(manual)toast('已刷新行情');
    }catch{showStatus(true);if(manual)toast(rows.length?'暂时无法获取新报价，已显示上次行情':'行情连接失败，请稍后重试')}
    finally{refreshing=false;btn.disabled=false}
  }
  try{rows=await(await fetch('market.json')).json()}catch{}
  try{const cached=JSON.parse(localStorage.getItem('daylog:market'));if(cached?.length===4&&cached.every((r,i)=>Number.isFinite(r.price)&&Number.isFinite(r.change)&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.timestamp)&&r.timestamp>=(rows[i]?.timestamp||'')))rows=cached.map((r,i)=>({...rows[i],price:r.price,change:r.change,timestamp:r.timestamp,history:Array.isArray(r.history)&&r.history.length<=32&&r.history.every(p=>Array.isArray(p)&&/^\d{4}-\d\d-\d\d$/.test(p[0])&&Number.isFinite(p[1]))?r.history:rows[i]?.history}))}catch{}
  paint();showStatus(true);btn.onclick=()=>refresh(true);refresh();setInterval(()=>{if(!document.hidden)refresh()},60000)
}

