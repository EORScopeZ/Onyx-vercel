const { sendCors, CORS } = require("./_lib");

module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") return sendCors(res);
  if (req.method !== "GET") { res.status(405).end(); return; }

  const lvUrl = process.env.LINKVERTISE_URL || "";
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "text/html");
  res.status(200).end(getkeyHtml(lvUrl));
};

function getkeyHtml(linkvertiseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Onyx — Get Your Key</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #05050f; color: #fff; font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
        .blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.18; animation: drift 12s ease-in-out infinite alternate; }
        .blob1 { width:500px;height:500px;background:#8b7fff;top:-100px;left:-100px; }
        .blob2 { width:400px;height:400px;background:#5b3fe3;bottom:-80px;right:-80px;animation-delay:-4s; }
        .blob3 { width:300px;height:300px;background:#a78bfa;top:50%;left:50%;transform:translate(-50%,-50%);animation-delay:-8s; }
        @keyframes drift { from{transform:translate(0,0) scale(1)} to{transform:translate(30px,20px) scale(1.08)} }
        .card { position:relative;z-index:1;background:rgba(15,15,30,0.82);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:44px 40px 36px;width:100%;max-width:440px;box-shadow:0 0 60px rgba(139,127,255,0.12),0 20px 60px rgba(0,0,0,0.5);backdrop-filter:blur(14px);text-align:center; }
        .card::before { content:'';position:absolute;top:0;left:20px;right:20px;height:3px;background:linear-gradient(90deg,#8b7fff,#a78bfa,#8b7fff);border-radius:0 0 4px 4px; }
        .logo { font-size:32px;font-weight:900;letter-spacing:6px;background:linear-gradient(135deg,#fff 30%,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px; }
        .subtitle { font-size:12px;color:#8b7fff;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px; }
        .instructions { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px;margin-bottom:28px;text-align:left; }
        .step { display:flex;align-items:flex-start;gap:10px;margin-bottom:8px; }
        .step:last-child{margin-bottom:0}
        .step-num { background:rgba(139,127,255,0.25);color:#a78bfa;font-size:11px;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px; }
        .step-text { font-size:13px;color:#aaa;line-height:1.5; }
        .step-text strong{color:#d4d0ff}
        #claimBtn { width:100%;padding:15px;background:linear-gradient(135deg,#8b7fff,#6d5ae0);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:opacity 0.2s,transform 0.15s,box-shadow 0.2s;box-shadow:0 4px 20px rgba(139,127,255,0.35);margin-bottom:20px; }
        #claimBtn:hover:not(:disabled){opacity:0.9;transform:translateY(-1px);box-shadow:0 6px 28px rgba(139,127,255,0.5)}
        #claimBtn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
        #statusArea{min-height:80px}
        .key-box{display:none;background:rgba(139,127,255,0.08);border:1px solid rgba(139,127,255,0.3);border-radius:12px;padding:16px 18px;margin-bottom:14px}
        .key-box.visible{display:block}
        .key-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#8b7fff;margin-bottom:8px}
        .key-value{font-family:'Courier New',monospace;font-size:17px;font-weight:700;color:#fff;letter-spacing:1px;word-break:break-all;margin-bottom:12px}
        .copy-btn{background:rgba(139,127,255,0.2);border:1px solid rgba(139,127,255,0.4);border-radius:8px;color:#a78bfa;font-size:12px;font-weight:600;padding:7px 16px;cursor:pointer;transition:background 0.15s,color 0.15s;letter-spacing:0.5px}
        .copy-btn:hover{background:rgba(139,127,255,0.35);color:#fff}
        .copy-btn.copied{background:rgba(60,200,100,0.2);border-color:rgba(60,200,100,0.4);color:#6be09a}
        .expires-note{font-size:11px;color:#555;margin-top:10px}
        .error-box{display:none;background:rgba(255,80,80,0.08);border:1px solid rgba(255,80,80,0.25);border-radius:12px;padding:14px 16px;font-size:13px;color:#ff8888;line-height:1.5}
        .error-box.visible{display:block}
        .spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px}
        @keyframes spin{to{transform:rotate(360deg)}}
        .footer{margin-top:24px;font-size:11px;color:#333;letter-spacing:0.5px}
    </style>
</head>
<body>
<div class="bg"><div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div></div>
<div class="card">
    <div class="logo">ONYX</div>
    <div class="subtitle">Key System</div>
    <div class="instructions">
        <div class="step"><div class="step-num">1</div><div class="step-text">Click <strong>Claim Your Key</strong> below.</div></div>
        <div class="step"><div class="step-num">2</div><div class="step-text">Copy the key that appears.</div></div>
        <div class="step"><div class="step-num">3</div><div class="step-text">Paste it into the <strong>Onyx auth screen</strong> in Roblox.</div></div>
    </div>
    <button id="claimBtn">🔑 &nbsp;Claim Your Key</button>
    <div id="statusArea">
        <div class="key-box" id="keyBox">
            <div class="key-label">Your Key</div>
            <div class="key-value" id="keyValue">—</div>
            <button class="copy-btn" id="copyBtn" onclick="copyKey()">Copy Key</button>
            <div class="expires-note" id="expiresNote"></div>
        </div>
        <div class="error-box" id="errorBox"><span id="errorMsg"></span></div>
    </div>
    <div class="footer">Keys expire after 48 hours · One per person</div>
</div>
<script>
    const claimBtn=document.getElementById("claimBtn"),keyBox=document.getElementById("keyBox"),keyValue=document.getElementById("keyValue"),copyBtn=document.getElementById("copyBtn"),expiresNote=document.getElementById("expiresNote"),errorBox=document.getElementById("errorBox"),errorMsg=document.getElementById("errorMsg");
    function formatDate(u){return new Date(u*1000).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}
    function formatCountdown(u){const d=u-Math.floor(Date.now()/1000);if(d<=0)return"now";const h=Math.floor(d/3600),m=Math.floor((d%3600)/60);return h+"h "+m+"m"}
    claimBtn.addEventListener("click",async()=>{
        claimBtn.disabled=true;claimBtn.innerHTML='<span class="spinner"></span>Generating...';
        keyBox.classList.remove("visible");errorBox.classList.remove("visible");
        try{
            const res=await fetch("/claim",{method:"POST",headers:{"Content-Type":"application/json"}});
            const data=await res.json();
            if(data.success){
                keyValue.textContent=data.key;expiresNote.textContent="Expires: "+formatDate(data.expires_at);
                keyBox.classList.add("visible");claimBtn.innerHTML="✓ Key Generated";
                claimBtn.style.background="linear-gradient(135deg,#3cc874,#27a05a)";
                claimBtn.style.boxShadow="0 4px 20px rgba(60,200,100,0.3)";
            } else if(data.cooldown){
                errorMsg.innerHTML="You already claimed a key recently.<br>Come back in <strong>"+formatCountdown(data.next_available)+"</strong>.";
                errorBox.classList.add("visible");claimBtn.disabled=false;claimBtn.innerHTML="🔑 &nbsp;Claim Your Key";
            } else {
                errorMsg.textContent=data.message||"Something went wrong.";
                errorBox.classList.add("visible");claimBtn.disabled=false;claimBtn.innerHTML="🔑 &nbsp;Claim Your Key";
            }
        } catch(e){
            errorMsg.textContent="Could not reach the key server. Try again later.";
            errorBox.classList.add("visible");claimBtn.disabled=false;claimBtn.innerHTML="🔑 &nbsp;Claim Your Key";
        }
    });
    function copyKey(){
        navigator.clipboard.writeText(keyValue.textContent).then(()=>{
            copyBtn.textContent="✓ Copied!";copyBtn.classList.add("copied");
            setTimeout(()=>{copyBtn.textContent="Copy Key";copyBtn.classList.remove("copied")},2000);
        });
    }
</script>
</body></html>`;
}
