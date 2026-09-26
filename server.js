import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import course from './course-data.json' with { type: 'json' };

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;
const MOLLIE_API = 'https://api.mollie.com/v2/payments';

function secret(){
  if(!process.env.ACCESS_SECRET) throw new Error('ACCESS_SECRET is missing');
  return process.env.ACCESS_SECRET;
}
function sign(value){ return crypto.createHmac('sha256',secret()).update(value).digest('base64url'); }
function makeToken(paymentId){
  const exp=Math.floor(Date.now()/1000)+60*60*24*365*5;
  const payload=Buffer.from(JSON.stringify({paymentId,exp})).toString('base64url');
  return payload+'.'+sign(payload);
}
function verifyToken(token){
  const [payload,sig]=String(token||'').split('.');
  if(!payload||!sig||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(sign(payload)))) return null;
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data.paymentId||!data.exp||data.exp<Math.floor(Date.now()/1000)) return null;
  return data;
}
async function getPayment(paymentId){
  const key=process.env.MOLLIE_API_KEY;
  if(!key) throw new Error('MOLLIE_API_KEY is missing');
  const r=await fetch(`${MOLLIE_API}/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${key}`}});
  const data=await r.json();
  if(!r.ok) throw new Error(data.detail||'Mollie verification failed');
  return data;
}

app.get('/',(_req,res)=>res.json({ok:true,service:'Mastery AI secure course backend'}));

app.post('/api/create-payment',async(_req,res)=>{
  const apiKey=process.env.MOLLIE_API_KEY;
  const siteUrl=process.env.SITE_URL;
  const backendUrl=process.env.BACKEND_URL;
  if(!apiKey||!siteUrl||!backendUrl||!process.env.ACCESS_SECRET) return res.status(500).json({error:'Server configuration missing'});
  try{
    const r=await fetch(MOLLIE_API,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      amount:{currency:'EUR',value:'10.00'},description:'Mastery AI — Formation complète',redirectUrl:`${siteUrl}/?payment=return`,webhookUrl:`${backendUrl}/api/webhook`,metadata:{product:'mastery-ai',version:'2'}
    })});
    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data.detail||'Mollie payment creation failed'});
    res.json({success:true,paymentId:data.id,checkoutUrl:data._links?.checkout?.href});
  }catch(e){res.status(500).json({error:e.message||'Unable to create payment'});}
});

app.post('/api/verify-access',async(req,res)=>{
  const paymentId=req.body?.paymentId;
  if(!paymentId)return res.status(400).json({error:'Missing paymentId'});
  try{
    const p=await getPayment(paymentId);
    const valid=p.metadata?.product==='mastery-ai' && p.amount?.currency==='EUR' && p.amount?.value==='10.00';
    if(!valid)return res.status(403).json({error:'Payment does not match Mastery AI'});
    if(p.status!=='paid')return res.status(200).json({status:p.status});
    res.json({success:true,accessToken:makeToken(p.id)});
  }catch(e){res.status(500).json({error:e.message||'Verification failed'});}
});

app.get('/api/course',async(req,res)=>{
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const data=verifyToken(token);
    if(!data)return res.status(401).json({error:'Unauthorized'});
    const p=await getPayment(data.paymentId);
    const valid=p.status==='paid'&&p.metadata?.product==='mastery-ai'&&p.amount?.currency==='EUR'&&p.amount?.value==='10.00';
    if(!valid)return res.status(403).json({error:'Paid access not confirmed'});
    res.json(course);
  }catch(e){res.status(500).json({error:e.message||'Unable to load course'});}
});

app.post('/api/webhook',async(req,res)=>{
  const paymentId=req.body?.id;
  if(!paymentId)return res.status(400).send('Missing payment id');
  try{
    const p=await getPayment(paymentId);
    if(p.status==='paid')console.log('PAID',p.id,p.amount?.value,p.metadata);
    res.status(200).send('OK');
  }catch(e){console.error('Webhook error',e);res.status(500).send('Webhook error');}
});

app.listen(PORT,()=>console.log(`Mastery AI backend listening on ${PORT}`));
